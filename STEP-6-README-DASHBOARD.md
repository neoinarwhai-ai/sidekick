# Step 6 (dashboard-only) — Alert box via Supabase web UI

Supabase's dashboard now lets you write and deploy Edge Functions
directly in the browser — no CLI needed. Here's the whole thing that
way.

## 1. Set your secrets

**Project Settings → Edge Functions → Secrets** (left sidebar: the
gear icon, then "Edge Functions" under Configuration).

Add three secrets:

| Name | Value |
|---|---|
| `TWITCH_CLIENT_ID` | your Twitch app's Client ID (from Step 1) |
| `TWITCH_CLIENT_SECRET` | your Twitch app's Client Secret (from Step 1) |
| `TWITCH_WEBHOOK_SECRET` | any random string, 32+ characters — this is a shared secret only you and Twitch's registration know, not a real password you need to remember |

For the webhook secret, anything long and random works — you can type
a long mashed-together string, or generate one at
https://www.uuidgenerator.net/ and strip the dashes.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
are already available automatically inside every Edge Function — you
don't add those yourself.

## 2. Create the `twitch-webhook` function

1. Go to **Edge Functions** in the left sidebar.
2. Click **Deploy a new function** (or **Create a new function** —
   wording varies by dashboard version).
3. Name it exactly: `twitch-webhook`
4. It opens an inline code editor with a starter template. Delete
   everything in it, and paste in the full contents of
   `supabase/functions/twitch-webhook/index.ts` from this project.
5. Click **Deploy**.
6. Once deployed, open that function's **Settings** and find **Verify
   JWT** (or **Enforce JWT verification**) — turn this **off**.
   This is important: Twitch calls this URL directly and doesn't send
   a Supabase login token, so with JWT verification on, Supabase
   would reject every real call from Twitch with a 401.
7. Copy the function's **URL** shown in the dashboard — it looks like
   `https://xxxx.supabase.co/functions/v1/twitch-webhook`. You'll need
   this in step 4.

## 3. Create the `twitch-subscribe` function

1. Back in **Edge Functions**, click **Deploy a new function** again.
2. Name it exactly: `twitch-subscribe`
3. Paste in the full contents of
   `supabase/functions/twitch-subscribe/index.ts` from this project.
4. Click **Deploy**.
5. Leave **Verify JWT** turned **on** for this one — only your logged-in
   dashboard should be allowed to call it.

## 4. Nothing more needed on the Twitch dev console

You already did the Twitch app setup in Step 1 — no changes needed
there for this step. The `twitch-subscribe` function handles
registering event subscriptions via Twitch's API directly.

## 5. Enable alerts from your dashboard app

Run your local dashboard (`apps/dashboard`) as usual, go to the
**Alerts** tab, click **Enable Alerts**. You should see a JSON result
with `"status": 202` for each of four subscription types (follow,
subscribe, raid, cheer). A `409` means it was already registered —
that's fine, not an error.

If you get an error here, double check:
- You're signed in with **Twitch** (not Kick — Kick alerts aren't
  wired up yet).
- The secrets in step 1 are saved correctly (typos in the Twitch
  Client ID/Secret are the most common cause of failures here).

## 6. Test it

Twitch's real follow/sub/raid events only fire for real interactions —
there's no "send a test event" button in this flow. Two ways to check
it's working:

- **Real test**: follow your own channel from a second account (or
  ask a friend to). Within a couple seconds, a banner should pop up
  on your overlay tab.
- **Fake it without waiting**: open **Table Editor → events_log** in
  Supabase and manually insert a row:
  - `broadcaster_id`: your own user id (Table Editor → profiles, copy
    your row's `id`)
  - `platform`: `twitch`
  - `event_type`: `follow`
  - `payload`: `{"display_text": "Test User followed!"}`
  
  Your overlay tab should show the banner immediately — it's just
  watching that table, so a manual row looks identical to a real one.

## Troubleshooting

- **Nothing happens on a real follow, no errors visible**: open the
  `twitch-webhook` function in the dashboard and check its **Logs**
  tab — every incoming call from Twitch and any errors show up there.
- **Logs show "no matching profile for twitch id"**: your account's
  `profiles.twitch_user_id` wasn't captured. This is populated at
  signup by the trigger from migration `0004_alerts.sql` — sign out
  and back in with Twitch to refresh it if your account predates that
  migration.
- **twitch-subscribe returns 401**: your dashboard session expired —
  refresh the page and sign in again before clicking Enable Alerts.
- **twitch-webhook returns 403 in the logs ("signature mismatch")**:
  the `TWITCH_WEBHOOK_SECRET` used when registering the subscription
  (inside `twitch-subscribe`) doesn't match the one Twitch is signing
  with. Make sure you only set this secret once and didn't change it
  between registering and now — if you did change it, click Enable
  Alerts again to re-register with the new value.
