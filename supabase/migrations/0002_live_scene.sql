-- ============================================================
-- 0002_live_scene.sql
-- Tracks which scene is currently "on air" and enables realtime
-- ============================================================

alter table public.broadcasters
  add column live_scene_id uuid references public.scenes(id) on delete set null;

-- Enable realtime (Postgres change feed) on the tables the overlay
-- page needs to react to. If your project already publishes all
-- tables by default, these may error with "already a member of
-- publication" — that's fine, it just means it's already on.
alter publication supabase_realtime add table public.widgets;
alter publication supabase_realtime add table public.broadcasters;

-- Overlay pages load with just a broadcaster id in the URL and are
-- not logged in as that broadcaster, so they need read-only public
-- access scoped to what's actually live. Anything not on the live
-- scene stays private.
create policy "public can read live scene widgets"
  on public.widgets for select
  using (
    exists (
      select 1 from public.broadcasters b
      where b.live_scene_id = widgets.scene_id
    )
  );

create policy "public can read broadcaster live_scene_id"
  on public.broadcasters for select
  using (true);
