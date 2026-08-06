-- ============================================================
-- 0004_alerts.sql
-- Track each profile's Twitch numeric user id so incoming
-- EventSub webhooks (which only know Twitch ids) can be mapped
-- back to a broadcaster row in our database.
-- ============================================================

alter table public.profiles add column twitch_user_id text;

create index if not exists profiles_twitch_user_id_idx
  on public.profiles (twitch_user_id);

-- Replace handle_new_user to also capture the Twitch id.
-- Twitch's OAuth payload puts the numeric user id in `sub`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, platform, username, display_name, avatar_url, twitch_user_id)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'provider', 'unknown'),
    coalesce(new.raw_user_meta_data->>'preferred_username', new.raw_user_meta_data->>'user_name'),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    case
      when new.raw_app_meta_data->>'provider' = 'twitch'
        then coalesce(new.raw_user_meta_data->>'sub', new.raw_user_meta_data->>'provider_id')
      else null
    end
  );
  return new;
end;
$$;

-- Overlay pages aren't authenticated, so they need read access to
-- events_log scoped to whatever broadcaster they're already showing.
create policy "public can read events_log"
  on public.events_log for select
  using (true);
