// supabase/functions/twitch-webhook/index.ts
//
// Receives EventSub notifications from Twitch (follow, subscribe,
// raid, cheer). Verifies the request actually came from Twitch,
// then writes a row to events_log. The overlay page is subscribed
// to events_log via Realtime and picks the new row up instantly —
// this function does NOT talk to Realtime directly, it just writes
// to the table.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWITCH_WEBHOOK_SECRET = Deno.env.get('TWITCH_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const messageId = req.headers.get('Twitch-Eventsub-Message-Id') ?? '';
  const timestamp = req.headers.get('Twitch-Eventsub-Message-Timestamp') ?? '';
  const signature = req.headers.get('Twitch-Eventsub-Message-Signature') ?? '';

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(TWITCH_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(messageId + timestamp + rawBody)
  );
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256=${hex}` === signature;
}

function describeEvent(subscriptionType: string, event: any) {
  switch (subscriptionType) {
    case 'channel.follow':
      return { event_type: 'follow', text: `${event.user_name} followed!` };
    case 'channel.subscribe':
      return { event_type: 'sub', text: `${event.user_name} subscribed (Tier ${event.tier?.[0] ?? '1'})!` };
    case 'channel.raid':
      return { event_type: 'raid', text: `${event.from_broadcaster_user_name} raided with ${event.viewers} viewers!` };
    case 'channel.cheer':
      return { event_type: 'cheer', text: `${event.user_name ?? 'Anonymous'} cheered ${event.bits} bits!` };
    default:
      return { event_type: subscriptionType, text: 'New event!' };
  }
}

Deno.serve(async (req) => {
  const rawBody = await req.text();
  const messageType = req.headers.get('Twitch-Eventsub-Message-Type');

  const valid = await verifySignature(req, rawBody);
  if (!valid) {
    return new Response('signature mismatch', { status: 403 });
  }

  const body = JSON.parse(rawBody);

  // Twitch sends this once, when you first register a subscription,
  // to prove you control the callback URL.
  if (messageType === 'webhook_callback_verification') {
    return new Response(body.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  if (messageType === 'notification') {
    const subscriptionType = body.subscription.type;
    const event = body.event;
    const twitchBroadcasterId = event.broadcaster_user_id;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('twitch_user_id', twitchBroadcasterId)
      .single();

    if (profileError || !profile) {
      console.error('no matching profile for twitch id', twitchBroadcasterId, profileError);
      return new Response('ok', { status: 200 }); // still 200 so Twitch doesn't retry forever
    }

    const { event_type, text } = describeEvent(subscriptionType, event);

    const { error: insertError } = await supabase.from('events_log').insert({
      broadcaster_id: profile.id,
      platform: 'twitch',
      event_type,
      payload: { ...event, display_text: text },
    });

    if (insertError) console.error('events_log insert error', insertError);

    return new Response('ok', { status: 200 });
  }

  // revocation or unknown message types — just acknowledge
  return new Response('ok', { status: 200 });
});
