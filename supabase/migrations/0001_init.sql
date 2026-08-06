-- ============================================================
-- 0001_init.sql
-- Core schema: profiles, broadcasters, mods, scenes, widgets,
-- sounds, alert_configs, events_log
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles: one row per logged-in user (created automatically)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  platform text not null,              -- 'twitch' | 'kick'
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are self-updatable"
  on public.profiles for update
  using (auth.uid() = id);

-- Automatically create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, platform, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'provider', 'unknown'),
    coalesce(new.raw_user_meta_data->>'preferred_username', new.raw_user_meta_data->>'user_name'),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- broadcasters: marks a profile as having an active dashboard
-- ------------------------------------------------------------
create table public.broadcasters (
  id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.broadcasters enable row level security;

create policy "broadcaster manages own row"
  on public.broadcasters for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------
-- mods: links a mod's profile to a broadcaster with permissions
-- ------------------------------------------------------------
create table public.mods (
  id uuid primary key default gen_random_uuid(),
  broadcaster_id uuid not null references public.broadcasters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_audio boolean not null default true,
  can_telestrator boolean not null default true,
  can_scenes boolean not null default true,
  can_alerts boolean not null default false,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (broadcaster_id, user_id)
);

alter table public.mods enable row level security;

create policy "broadcaster manages their mods"
  on public.mods for all
  using (auth.uid() = broadcaster_id)
  with check (auth.uid() = broadcaster_id);

create policy "mod can see their own membership"
  on public.mods for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- helper: is the current user allowed into a broadcaster's stuff?
-- ------------------------------------------------------------
create or replace function public.has_broadcaster_access(target_broadcaster uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select
    auth.uid() = target_broadcaster
    or exists (
      select 1 from public.mods
      where broadcaster_id = target_broadcaster
        and user_id = auth.uid()
        and accepted_at is not null
    );
$$;

-- ------------------------------------------------------------
-- scenes
-- ------------------------------------------------------------
create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  broadcaster_id uuid not null references public.broadcasters(id) on delete cascade,
  name text not null default 'Untitled Scene',
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scenes enable row level security;

create policy "broadcaster access to scenes"
  on public.scenes for all
  using (public.has_broadcaster_access(broadcaster_id))
  with check (public.has_broadcaster_access(broadcaster_id));

-- ------------------------------------------------------------
-- widgets
-- ------------------------------------------------------------
create table public.widgets (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  broadcaster_id uuid not null references public.broadcasters(id) on delete cascade,
  type text not null,                 -- 'text' | 'image' | 'timer' | ...
  layer text not null default 'default',
  props jsonb not null default '{}'::jsonb,
  position jsonb not null default '{"x":0,"y":0,"w":200,"h":100,"rotation":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.widgets enable row level security;

create policy "broadcaster access to widgets"
  on public.widgets for all
  using (public.has_broadcaster_access(broadcaster_id))
  with check (public.has_broadcaster_access(broadcaster_id));

-- ------------------------------------------------------------
-- sounds
-- ------------------------------------------------------------
create table public.sounds (
  id uuid primary key default gen_random_uuid(),
  broadcaster_id uuid not null references public.broadcasters(id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.sounds enable row level security;

create policy "broadcaster access to sounds"
  on public.sounds for all
  using (public.has_broadcaster_access(broadcaster_id))
  with check (public.has_broadcaster_access(broadcaster_id));

-- ------------------------------------------------------------
-- alert_configs
-- ------------------------------------------------------------
create table public.alert_configs (
  id uuid primary key default gen_random_uuid(),
  broadcaster_id uuid not null references public.broadcasters(id) on delete cascade,
  event_type text not null,           -- 'sub' | 'follow' | 'raid' | 'bits' | ...
  template jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.alert_configs enable row level security;

create policy "broadcaster access to alert_configs"
  on public.alert_configs for all
  using (public.has_broadcaster_access(broadcaster_id))
  with check (public.has_broadcaster_access(broadcaster_id));

-- ------------------------------------------------------------
-- events_log
-- ------------------------------------------------------------
create table public.events_log (
  id uuid primary key default gen_random_uuid(),
  broadcaster_id uuid not null references public.broadcasters(id) on delete cascade,
  platform text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.events_log enable row level security;

create policy "broadcaster access to events_log"
  on public.events_log for all
  using (public.has_broadcaster_access(broadcaster_id))
  with check (public.has_broadcaster_access(broadcaster_id));
