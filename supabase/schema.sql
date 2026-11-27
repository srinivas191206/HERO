-- ============================================================================
-- HERO (Hybrid Emergency Response & Operations) — Supabase State Cloud Schema
-- Tier 1 State Aggregation Database (PostgreSQL + Realtime + RLS)
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Districts Registry
create table if not exists public.districts (
  id text primary key,
  code text unique not null,
  name text not null,
  state_name text not null default 'Andhra Pradesh',
  center_lat double precision not null default 17.6868,
  center_lng double precision not null default 83.2185,
  node_key_hash text,
  status text not null default 'provisioning' check (status in ('online', 'offline', 'provisioning')),
  last_sync_at bigint,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- 2. Teams (Scoped to District)
create table if not exists public.teams (
  id text primary key,
  district_id text not null references public.districts(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#0284C7'
);

-- 3. Users (Officers, District Dispatchers, State Admins)
create table if not exists public.users (
  id text primary key,
  badge_number text unique not null,
  pin_hash text not null,
  name text not null,
  role text not null check (role in ('officer', 'dispatcher', 'state_admin')),
  status text not null default 'Offline',
  battery integer default 100,
  team_id text references public.teams(id) on delete set null,
  district_id text not null references public.districts(id) on delete cascade,
  last_heartbeat bigint,
  last_lat double precision,
  last_lng double precision,
  auth_user_id uuid unique
);

-- 4. Incidents (P1-P4)
create table if not exists public.incidents (
  id text primary key,
  district_id text not null references public.districts(id) on delete cascade,
  title text not null,
  description text,
  priority text not null check (priority in ('P1', 'P2', 'P3', 'P4')),
  status text not null default 'Open' check (status in ('Open', 'Dispatched', 'Resolved', 'Closed')),
  location_lat double precision,
  location_lng double precision,
  reporter_id text not null,
  assignee_id text,
  timestamp bigint not null,
  timeline jsonb not null default '[]'::jsonb
);

-- 5. Tactical Messages
create table if not exists public.messages (
  id text primary key,
  district_id text not null references public.districts(id) on delete cascade,
  sender_id text not null,
  recipient_id text,
  team_id text,
  body text not null,
  priority integer not null default 5,
  timestamp bigint not null,
  is_broadcast boolean not null default false
);

-- 6. Evidence Vault (SHA-256 Verified)
create table if not exists public.evidence (
  id text primary key,
  district_id text not null references public.districts(id) on delete cascade,
  officer_id text not null,
  incident_id text,
  description text,
  file_path text,
  storage_object_path text,
  hash text not null,
  hash_verified boolean not null default false,
  location_lat double precision,
  location_lng double precision,
  timestamp bigint not null
);

-- 7. Security Audit Trail
create table if not exists public.audit_logs (
  id text primary key,
  district_id text references public.districts(id) on delete cascade,
  user_id text,
  action text not null,
  ip_address text,
  timestamp bigint not null
);

-- Indexes for State Dashboard queries
create index if not exists idx_sb_incidents_district on public.incidents(district_id, priority, timestamp desc);
create index if not exists idx_sb_users_district on public.users(district_id, role);
create index if not exists idx_sb_evidence_district on public.evidence(district_id, timestamp desc);
create index if not exists idx_sb_audit_district on public.audit_logs(district_id, timestamp desc);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
alter table public.districts enable row level security;
alter table public.teams enable row level security;
alter table public.users enable row level security;
alter table public.incidents enable row level security;
alter table public.messages enable row level security;
alter table public.evidence enable row level security;
alter table public.audit_logs enable row level security;

-- Helper function: true if authenticated Supabase user is mapped as a state_admin
create or replace function public.is_state_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.users
    where auth_user_id = auth.uid()
      and role = 'state_admin'
  );
$$;

-- State Admins can read/manage all districts, teams, users, incidents, messages, evidence, audit_logs
create policy "state_admin_all_districts" on public.districts
  for all to authenticated using (public.is_state_admin()) with check (public.is_state_admin());

create policy "state_admin_all_teams" on public.teams
  for all to authenticated using (public.is_state_admin()) with check (public.is_state_admin());

create policy "state_admin_all_users" on public.users
  for all to authenticated using (public.is_state_admin()) with check (public.is_state_admin());

create policy "state_admin_all_incidents" on public.incidents
  for all to authenticated using (public.is_state_admin()) with check (public.is_state_admin());

create policy "state_admin_all_messages" on public.messages
  for all to authenticated using (public.is_state_admin()) with check (public.is_state_admin());

create policy "state_admin_all_evidence" on public.evidence
  for all to authenticated using (public.is_state_admin()) with check (public.is_state_admin());

create policy "state_admin_all_audit" on public.audit_logs
  for all to authenticated using (public.is_state_admin()) with check (public.is_state_admin());

-- Realtime publication for live State Command Center updates
alter publication supabase_realtime add table public.districts, public.incidents, public.users;

-- Evidence Storage Bucket (Private)
insert into storage.buckets (id, name, public)
values ('hero-evidence', 'hero-evidence', false)
on conflict (id) do nothing;

