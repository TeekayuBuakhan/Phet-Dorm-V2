-- ลบตาราง profiles: ตัวตนของผู้ใช้มี 2 บัญชีเท่านั้น
--   ผู้เช่า  = ตาราง public.tenant (สร้างอัตโนมัติตอนสมัครทุกบัญชี)
--   ผู้ดูแล = ตาราง public.admin (ผูก auth.users ผ่าน user_id)
--
-- สิ่งที่ migration นี้ทำ:
--   1. handle_new_user() / handle_user_email_update() / update_my_phone_number()
--      ไม่แตะ profiles อีกต่อไป (tenant เป็นแหล่งเดียวของผู้เช่า)
--   2. แอดมินไม่มีแถวใน tenant: trigger บน admin ลบแถว tenant ของผู้ที่กลายเป็นแอดมิน
--   3. get_my_profile() แทนการอ่าน profiles ผ่าน PostgREST ฝั่ง client
--      (admin ยังปิด RLS เพราะมีคอลัมน์ password เก็บ plain text)
--   4. ย้าย unique index เบอร์/อีเมล และ check format เบอร์ ไปไว้ที่ tenant
--   5. FK tenant.user_id ชี้ auth.users(id) ON DELETE CASCADE (ลบ user = ลบแถว tenant)
--   6. drop table public.profiles พร้อม trigger/policies/indexes ที่พ่วงมา

-- 1. เติมช่องว่างใน tenant จาก profiles ก่อนลบ (กันข้อมูลตกหล่น) ------------
update public.tenant t
set email = coalesce(nullif(trim(coalesce(t.email, '')), ''), p.email),
    full_name = coalesce(nullif(trim(coalesce(t.full_name, '')), ''), p.full_name),
    phone_number = coalesce(t.phone_number, p.phone_number)
from public.profiles p
where t.user_id = p.id;

-- 2. สมัครสมาชิก = แถวใน tenant อย่างเดียว --------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone_number', '')), '');
  v_full_name text;
begin
  if v_phone is null or v_phone !~ '^0[0-9]{9}$' then
    raise exception 'phone_number is required and must be 10 digits starting with 0'
      using errcode = 'check_violation';
  end if;

  v_full_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  insert into public.tenant (user_id, email, full_name, phone_number, password, room_number)
  values (new.id, new.email, v_full_name, v_phone, '', null)
  on conflict (user_id) do nothing;

  return new;
end $$;

-- 3. ผู้ใช้เปลี่ยนอีเมล -> อัปเดตใน tenant ตาม (admin ไม่มีคอลัมน์ email) ---
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenant
  set email = new.email
  where user_id = new.id;

  return new;
end $$;

-- 4. แอดมินไม่ใช่ผู้เช่า: ลบแถว tenant ของผู้ที่กลายเป็นแอดมิน --------------
drop trigger if exists admin_role_sync on public.admin;
drop function if exists public.sync_admin_to_profile();

create or replace function public.admin_cleanup_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.user_id is not null then
    delete from public.tenant where user_id = new.user_id;
  end if;

  return new;
end $$;

drop trigger if exists admin_cleanup_tenant on public.admin;
create trigger admin_cleanup_tenant
  after insert or update of user_id on public.admin
  for each row execute function public.admin_cleanup_tenant();

-- 5. ผู้เช่าเปลี่ยนเบอร์ -> แก้แค่ tenant (เช็คเบอร์ซ้ำจาก tenant) ----------
create or replace function public.update_my_phone_number(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trimmed text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_user_id is null then
    raise exception 'ยังไม่ได้เข้าสู่ระบบ';
  end if;

  if v_trimmed is null or v_trimmed !~ '^0[0-9]{9}$' then
    raise exception 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักและขึ้นต้นด้วย 0';
  end if;

  if exists (
    select 1 from public.tenant
    where phone_number = v_trimmed and user_id <> v_user_id
  ) then
    raise exception 'เบอร์โทรศัพท์นี้ถูกใช้สมัครไว้แล้ว';
  end if;

  update public.tenant
  set phone_number = v_trimmed
  where user_id = v_user_id;

  return true;
end $$;

revoke all on function public.update_my_phone_number(text) from public;
grant execute on function public.update_my_phone_number(text) to authenticated;

-- 6. API ขอข้อมูลตัวตนของตัวเอง (admin/tenant ตามตาราง) ---------------------
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_result jsonb;
begin
  if v_user_id is null then
    return null;
  end if;

  select a.email into v_email from auth.users a where a.id = v_user_id;

  select jsonb_build_object(
    'user_id', user_id,
    'role', 'admin',
    'email', v_email,
    'full_name', full_name,
    'phone_number', phone_number,
    'room_number', null,
    'contact_qr', contact_qr
  )
  into v_result
  from public.admin
  where user_id = v_user_id;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object(
    'user_id', user_id,
    'role', 'tenant',
    'email', coalesce(email, v_email),
    'full_name', full_name,
    'phone_number', phone_number,
    'room_number', room_number,
    'contact_qr', null
  )
  into v_result
  from public.tenant
  where user_id = v_user_id;

  return v_result;
end $$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

-- 7. ย้าย constraint ที่ profiles เคยบังคับ มาไว้ที่ tenant ------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_phone_number_format'
      and conrelid = 'public.tenant'::regclass
  ) then
    alter table public.tenant
      add constraint tenant_phone_number_format
      check (phone_number is null or phone_number ~ '^0[0-9]{9}$');
  end if;
end $$;

create unique index if not exists tenant_phone_number_key
  on public.tenant (phone_number)
  where phone_number is not null;

create unique index if not exists tenant_email_key
  on public.tenant (email)
  where email is not null;

-- 8. FK tenant.user_id -> auth.users(on delete cascade) เข้ามาแทน profiles ----
alter table public.tenant
  drop constraint if exists tenant_user_id_fkey_profiles;

alter table public.tenant
  drop constraint if exists tenant_user_id_fkey;

alter table public.tenant
  add constraint tenant_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- 9. ล้างแถว tenant ที่เป็นแอดมิน (ให้เหลือผู้เช่าเท่านั้น) --------------------
delete from public.tenant t
using public.admin a
where a.user_id = t.user_id;

-- 10. ลบ trigger/ฟังก์ชันที่ผูกกับ profiles แล้วลบตารางทิ้ง ------------------
drop trigger if exists profile_to_tenant_sync on public.profiles;
drop function if exists public.sync_profile_to_tenant();

drop table if exists public.profiles cascade;

comment on table public.tenant is
  'บัญชีผู้เช่า (สร้างอัตโนมัติตอนสมัครทุกบัญชี) ตัวตนของผู้ใช้ฝั่งผู้เช่า';

comment on table public.admin is
  'บัญชีผู้ดูแล (user_id ชี้ auth.users) เพิ่ม/ลบผู้ดูแลผ่าน SQL เท่านั้น ไม่มีแถวใน tenant';