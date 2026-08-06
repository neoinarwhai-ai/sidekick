# Step 6 — Alert box (Twitch EventSub)

This step is different from the others: the webhook that receives
"someone followed/subscribed/raided" events from Twitch has to be a
real internet-reachable URL, not something running on your laptop.
That's what Supabase Edge Functions are for — small serverless
functions Supabase hosts for you. Deploying them requires the
Supabase CLI (there's no way to do this from the web dashboard alone).

## 1. Install the Supabase CLI

```bash
npm install -g supabase
```

## 2. Log in and link this project

```bash
supabase login
cd overlay-tool
supabase link --project-ref YOUR-PROJECT-REF
```

(Your project ref is the `xxxx` part of `https://xxxx.supabase.co`.)

## 3. Run the new migration

Same as before — paste `supabase/migrations/0004_alerts.sql` into the
Supabase SQL Editor and run it. (Or, now that the CLI is linked, you
could instead run `supabase db push` to apply all migrations at once —
either works.)

## 4. Set the secrets the Edge Functions need

You already have a Twitch Client ID/Secret from Step 1. You need one
new value: a webhook secret, which is just a random string only you
and Twitch's registration know — pick anything, e.g. generate one:

```bash
# any random 32+ char string works, this is just one way to make one
openssl rand -hex 32
```

Then set all the secrets:

```bash
supabase secrets set TWITCH_CLIENT_ID=your_twitch_client_id
supabase secrets set TWITCH_CLIENT_SECRET=your_twitch_client_secret
supabase secrets set TWITCH_WEBHOOK_SECRET=the_random_string_you_generated
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
are automatically available inside Edge Functions — you don't set
those yourself.)

## 5. Deploy the two functions

```bash
supabase functions deploy twitch-webhook --no-verify-jwt
supabase functions deploy twitch-subscribe
```

`twitch-webhook` needs `--no-verify-jwt` because Twitch calls it
directly — it's not carrying a Supabase login token, so Supabase's
default JWT check would reject it. `twitch-subscribe` keeps JWT
verification on since only a logged-in broadcaster should call it.

## 6. Enable alerts from the dashboard

Run the dashboard as usual, go to the new **Alerts** tab, click
**Enable Alerts**. You should see a JSON result with a `status: 202`
for each of the four subscription types (follow/subscribe/raid/cheer).
If you see `409` for one, that just means it was already registered —
fine.

## 7. Test it

Twitch's follow/sub/raid events only fire for real — there's no easy
"send a fake one" button. Two ways to test:

- **Easiest**: follow your own channel from another account, or ask a
  friend to. A real follow event should show up as a banner on your
  overlay tab within a couple seconds.
- **Alternative**: temporarily insert a row directly into `events_log`
  from the Supabase Table Editor with `event_type: 'follow'` and
  `payload: {"display_text": "Test User followed!"}` — the overlay
  will show it exactly like a real one, since it's just watching that
  table.

## Troubleshooting

- **Nothing happens, no errors**: check `supabase functions logs
  twitch-webhook` — this shows you every incoming call and any errors
  from inside the function.
- **"no matching profile for twitch id"** in the logs: your
  `profiles.twitch_user_id` wasn't captured at signup. Sign out, sign
  back in with Twitch — the updated trigger from this migration will
  populate it on the next login. (Existing rows from before this
  migration won't backfill automatically.)
- **401 on twitch-subscribe**: you're not logged into the dashboard,
  or your session expired — refresh and sign in again.
