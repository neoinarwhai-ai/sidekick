# Step 7 — Deploy to sidekik.dpdns.org via GitHub Pages

## 1. Push this project to your repo

```bash
cd overlay-tool
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/neoinarwhai-ai/sidekick.git
git push -u origin main
```

## 2. Add your Supabase keys as GitHub Actions secrets

The build needs your Supabase URL/anon key, but those shouldn't live
in the repo itself.

Go to your repo → **Settings → Secrets and variables → Actions →
New repository secret**. Add two:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon public key |

(Same values you've been putting in `.env.local` locally.)

## 3. Turn on GitHub Pages, set source to "GitHub Actions"

Repo → **Settings → Pages**. Under **Build and deployment → Source**,
select **GitHub Actions** (not "Deploy from a branch" — the workflow
in this project uses the newer Actions-based deploy method).

## 4. Point your DNS at GitHub

`dpdns.org` is a subdomain-hosting service (deSEC), so `sidekik` is
your own subdomain, not an apex domain — this makes DNS simpler, you
only need one record.

Log into wherever you manage `sidekik.dpdns.org`'s DNS (deSEC's
dashboard at https://desec.io if that's your provider) and add:

| Type | Name | Value |
|---|---|---|
| CNAME | `sidekik` (or `sidekik.dpdns.org`, depending on how the provider wants it entered) | `neoinarwhai-ai.github.io` |

No A records needed — that's only for apex/root domains
(`example.com` with nothing in front of it). Since you have a
subdomain, a single CNAME record is all GitHub Pages needs.

## 5. Push to trigger the deploy

The workflow runs automatically on every push to `main`. Push a
commit (even a trivial one) to kick it off, then check the **Actions**
tab in your repo to watch it build and deploy.

## 6. Set the custom domain in GitHub Pages settings

Back in **Settings → Pages**, under **Custom domain**, enter
`sidekik.dpdns.org` and save. Wait for the DNS check to go green
(can take a few minutes to a few hours depending on DNS propagation).
Once it's verified, tick **Enforce HTTPS**.

## 7. Update Supabase's allowed redirect URLs

Right now Supabase only knows about `localhost` for OAuth redirects.
Go to Supabase → **Authentication → URL Configuration** and add:

```
https://sidekik.dpdns.org
```

to both **Site URL** (or add it to the redirect allow list, depending
on your dashboard version) and **Redirect URLs**. Without this,
signing in with Twitch on the live site will fail after Twitch sends
you back, because Supabase will reject a redirect to a domain it
doesn't recognize.

## 8. Test it

- Visit `https://sidekik.dpdns.org` → should show the SIDEKICK login
  screen, sign in with Twitch should work end to end.
- Click **Copy Overlay URL** → should now copy
  `https://sidekik.dpdns.org/live/?broadcaster=...` instead of a
  localhost link.
- Open that URL directly → should load the transparent overlay page,
  same as it did locally.
- Add that overlay URL as an OBS **Browser Source** — this is the
  real, final step where it becomes an actual stream overlay instead
  of just something in a browser tab.

## Troubleshooting

- **DNS check never goes green**: CNAME records can take a while to
  propagate. You can check propagation status with
  `nslookup sidekik.dpdns.org` — once it resolves to a
  `github.io` address, GitHub's check should pass shortly after.
- **Site loads but Twitch login fails after redirecting back**: almost
  always the Supabase redirect URL step (step 7) — double check the
  exact domain is added with `https://`, no trailing slash mismatch.
- **Overlay page loads at `/live/` but shows a blank white screen**:
  open browser dev tools console — if you see 404s for JS/CSS files,
  the `base: '/live/'` path in `apps/overlay/vite.config.js` and the
  actual deployed path don't match; confirm the workflow really did
  put the overlay build under `site/live/`.
