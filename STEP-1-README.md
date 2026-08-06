# Step 1 — Supabase project + schema + Twitch login

Goal: end of this step, you can click "Sign in with Twitch" in a bare-bones
local app, and see a `profiles` row created for you in the database.

## 1. Create the Supabase project

1. Go to https://supabase.com → sign up / log in → **New Project**.
2. Pick a name, a database password (save it somewhere — you won't need it
   day-to-day, but keep it), and a region close to you.
3. Wait ~2 min for provisioning.
4. In the project, go to **Project Settings → API**. Copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** key
   You'll paste these into `.env.local` in step 5.

## 2. Register a Twitch application

1. Go to https://dev.twitch.tv/console/apps → **Register Your Application**.
2. Name: anything (e.g. "YourName Overlay Dashboard").
3. **OAuth Redirect URLs**: add your Supabase callback URL. It's:
   `https://xxxx.supabase.co/auth/v1/callback`
   (same project ref as above — find the exact value in Supabase under
   **Authentication → Providers → Twitch**, it's shown there once you open it).
4. Category: pick anything reasonable (e.g. "Application Integration").
5. Save. Copy the **Client ID**, then generate and copy a **Client Secret**.

## 3. Connect Twitch to Supabase Auth

1. In Supabase: **Authentication → Providers → Twitch**.
2. Toggle it on.
3. Paste in the Client ID and Client Secret from step 2.
4. Save.

## 4. Run the schema migration

Easiest path without installing the Supabase CLI:

1. In Supabase: **SQL Editor → New query**.
2. Paste in the full contents of `supabase/migrations/0001_init.sql` from
   this project.
3. Run it. You should see "Success. No rows returned."
4. Check **Table Editor** — you should now see `profiles`, `broadcasters`,
   `mods`, `scenes`, `widgets`, `sounds`, `alert_configs`, `events_log`.

(Later, once you're comfortable, we can switch to the Supabase CLI so
migrations are version-controlled and repeatable — not necessary yet.)

## 5. Run the dashboard smoke test locally

```bash
cd apps/dashboard
npm install
cp .env.example .env.local
# edit .env.local, paste in your Project URL and anon key from step 1
npm run dev
```

Open the printed localhost URL. Click **Sign in with Twitch**. You should
be redirected to Twitch, approve, and land back on the page showing your
session and a matching `profiles` row pulled from the database.

If the `profiles` row doesn't appear:
- Check **Table Editor → profiles** directly in Supabase to see if a row
  was created at all (confirms whether it's a trigger issue vs. a
  frontend fetch issue).
- Check **Database → Functions → handle_new_user** exists and
  **Database → Triggers → on_auth_user_created** exists.

## What's next (step 2)

Once Twitch login round-trips cleanly and you can see your profile row,
we'll build the actual dashboard shell: a real design pass (using the
frontend-design approach, not this bare test page), scene list, and the
canvas editor foundation.
