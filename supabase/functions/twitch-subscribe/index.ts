// supabase/functions/twitch-subscribe/index.ts
//
// Called from the dashboard (authenticated) when a broadcaster clicks
// "Enable Alerts". Gets a Twitch app access token, then registers
// EventSub subscriptions (follow/subscribe/raid/cheer) pointed at the
// twitch-webhook function above. Safe to call more than once — Twitch
// returns an error for already-existing subscriptions, which we just
// log and skip rather than fail the whole request on.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWITCH_CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID')!;
const TWITCH_CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET')!;
const TWITCH_WEBHOOK_SECRET = Deno.env.get('TWITCH_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const WEBHOOK_CALLBACK = `${SUPABASE_URL}/functions/v1/twitch-webhook`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUBSCRIPTIONS = [
  { type: 'channel.follow', version: '2', needsModeratorId: true },
  { type: 'channel.subscribe', version: '1', needsModeratorId: false },
  { type: 'channel.raid', version: '1', needsModeratorId: false, condition: 'to_broadcaster_user_id' },
  { type: 'channel.cheer', version: '1', needsModeratorId: false },
];

async function getAppAccessToken() {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') ?? '';

  // Identify the calling user from their JWT to get their twitch_user_id.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'not authenticated' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('twitch_user_id')
    .eq('id', user.id)
    .single();

  if (!profile?.twitch_user_id) {
    return new Response(
      JSON.stringify({ error: 'no twitch_user_id on this profile — must be signed in via Twitch' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const twitchId = profile.twitch_user_id;
  const appToken = await getAppAccessToken();

  const results = [];
  for (const sub of SUBSCRIPTIONS) {
    const conditionKey = sub.condition ?? 'broadcaster_user_id';
    const condition: Record<string, string> = { [conditionKey]: twitchId };
    if (sub.needsModeratorId) condition.moderator_user_id = twitchId;

    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Client-Id': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: sub.type,
        version: sub.version,
        condition,
        transport: {
          method: 'webhook',
          callback: WEBHOOK_CALLBACK,
          secret: TWITCH_WEBHOOK_SECRET,
        },
      }),
    });
    const body = await res.json();
    results.push({ type: sub.type, status: res.status, body });
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
