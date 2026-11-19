-- Floor Plan 3D Preview — Supabase skeleton
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Everything here is optional at runtime: the app degrades when env vars are empty.

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Untitled room',
  -- Raw outline + holes as authored, before normalization.
  geometry jsonb not null,
  -- Cached takeoff so a saved plan can be listed without re-running the pipeline.
  metrics jsonb,
  wall_height numeric not null default 2.8,
  units text not null default 'm',
  floor_material text,
  wall_material text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists floor_plans_user_created_idx
  on public.floor_plans (user_id, created_at desc);

-- New user -> profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists floor_plans_touch_updated_at on public.floor_plans;
create trigger floor_plans_touch_updated_at
  before update on public.floor_plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.floor_plans enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "floor_plans: read own" on public.floor_plans;
create policy "floor_plans: read own"
  on public.floor_plans for select
  using (auth.uid() = user_id);

drop policy if exists "floor_plans: insert own" on public.floor_plans;
create policy "floor_plans: insert own"
  on public.floor_plans for insert
  with check (auth.uid() = user_id);

drop policy if exists "floor_plans: update own" on public.floor_plans;
create policy "floor_plans: update own"
  on public.floor_plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "floor_plans: delete own" on public.floor_plans;
create policy "floor_plans: delete own"
  on public.floor_plans for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public)
values
  ('floorplan-images', 'floorplan-images', true),
  ('glb-exports', 'glb-exports', true)
on conflict (id) do nothing;

drop policy if exists "plan images: public read" on storage.objects;
create policy "plan images: public read"
  on storage.objects for select
  using (bucket_id = 'floorplan-images');

drop policy if exists "plan images: authenticated write" on storage.objects;
create policy "plan images: authenticated write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'floorplan-images');

drop policy if exists "plan images: owner delete" on storage.objects;
create policy "plan images: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'floorplan-images' and owner = auth.uid());

drop policy if exists "glb exports: public read" on storage.objects;
create policy "glb exports: public read"
  on storage.objects for select
  using (bucket_id = 'glb-exports');

drop policy if exists "glb exports: authenticated write" on storage.objects;
create policy "glb exports: authenticated write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'glb-exports');

drop policy if exists "glb exports: owner delete" on storage.objects;
create policy "glb exports: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'glb-exports' and owner = auth.uid());
