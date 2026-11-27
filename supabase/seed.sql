-- ============================================================================
-- HERO Supabase Cloud Seed & RPC Helpers
-- Run this AFTER supabase/schema.sql in Supabase SQL Editor.
-- ============================================================================

-- 1. Seed starter districts
insert into public.districts (id, code, name, state_name, center_lat, center_lng, status, created_at)
values
  ('d_eluru', 'ELR', 'Eluru District Hub', 'Andhra Pradesh', 16.7106, 81.0952, 'offline', (extract(epoch from now()) * 1000)::bigint),
  ('d_vzg',   'VZG', 'Visakhapatnam District Hub', 'Andhra Pradesh', 17.6868, 83.2185, 'provisioning', (extract(epoch from now()) * 1000)::bigint),
  ('d_rjy',   'RJY', 'Rajahmundry District Hub', 'Andhra Pradesh', 17.0005, 81.8040, 'provisioning', (extract(epoch from now()) * 1000)::bigint)
on conflict (id) do nothing;

-- 2. Seed starter teams for Eluru / Visakhapatnam / Rajahmundry
insert into public.teams (id, district_id, name, description, color)
values
  ('t1', 'd_eluru', 'Alpha Team', 'Frontline disaster rescue team', '#00E5FF'),
  ('t2', 'd_eluru', 'Bravo Team', 'Tactical perimeter containment team', '#FFD600'),
  ('t3', 'd_eluru', 'Charlie Team', 'Command backup & medical logistics', '#00E676'),
  ('d_vzg_t1', 'd_vzg', 'Alpha Team', 'Visakhapatnam Frontline Rescue', '#00E5FF'),
  ('d_vzg_t2', 'd_vzg', 'Bravo Team', 'Visakhapatnam Perimeter Containment', '#FFD600'),
  ('d_rjy_t1', 'd_rjy', 'Alpha Team', 'Rajahmundry Frontline Rescue', '#00E5FF')
on conflict (id) do nothing;

-- 3. RPC Helper: Assign District Personnel with real bcrypt ($2a$10$) PIN hash
-- Compatible with backend bcryptjs.compareSync() when exported offline!
create or replace function public.assign_district_user(
  p_badge_number text,
  p_name text,
  p_pin text,
  p_role text,
  p_district_id text,
  p_team_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text;
  v_pin_hash text;
begin
  if not public.is_state_admin() then
    raise exception 'Forbidden: state_admin role required';
  end if;

  if p_role not in ('officer', 'dispatcher') then
    raise exception 'Invalid role: must be officer or dispatcher';
  end if;

  v_id := 'u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_pin_hash := crypt(p_pin, gen_salt('bf', 10));

  insert into public.users (id, badge_number, pin_hash, name, role, status, battery, team_id, district_id, last_heartbeat)
  values (v_id, trim(p_badge_number), v_pin_hash, trim(p_name), p_role, 'Offline', 100, p_team_id, p_district_id, (extract(epoch from now()) * 1000)::bigint);

  return jsonb_build_object(
    'id', v_id,
    'badgeNumber', trim(p_badge_number),
    'name', trim(p_name),
    'role', p_role,
    'districtId', p_district_id,
    'teamId', p_team_id,
    'status', 'Offline'
  );
end;
$$;

grant execute on function public.assign_district_user(text, text, text, text, text, text) to authenticated;

-- ============================================================================
-- 4. Link State Admin account (already applied for admin@herolab.in):
-- ============================================================================
-- insert into public.users (id, badge_number, pin_hash, name, role, status, battery, district_id, auth_user_id)
-- select
--   'u_state1',
--   'state_admin',
--   crypt('police', gen_salt('bf', 10)),
--   'AP State Command Admin',
--   'state_admin',
--   'Available',
--   100,
--   'd_eluru',
--   id
-- from auth.users
-- where email = 'admin@herolab.in'
-- on conflict (id) do update set auth_user_id = excluded.auth_user_id, role = 'state_admin';
