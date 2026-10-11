-- แหล่งเดียวของบัญชีผู้ดูแล = ตาราง public.admin
--
-- หลักการ:
--   เป็นผู้ดูแล หมายถึงมีแถวใน public.admin ที่มี user_id ตรงกับบัญชี auth.users
--   (เดิมเช็ค profiles.role + admin_allowlist ต่างหาก จึงมี "หลายแหล่ง")
--
-- สิ่งที่ migration นี้ทำ:
--   1. is_admin() / current_role() ตรวจจากตาราง admin เป็นหลัก
--   2. handle_new_user() ไม่พึ่ง admin_allowlist อีกต่อไป (ทุกคนที่สมัครเป็น tenant)
--   3. เก็บ profiles.role ไว้เป็น mirror ซิงก์ผ่าน trigger จากตาราง admin
--      (หน้าเว็บยังอ่าน profiles.role ได้ ไม่ต้องแก้ client)
--   4. ลบตาราง admin_allowlist ทิ้ง
--   5. ย้ายแถว admin ที่มีอยู่เดิม (ข้อมูล 000001) ไปผูกกับบัญชีผู้ใช้จริง

-- 1. บทบาทของผู้ใช้มาจากตาราง admin ------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin a
    where a.user_id = auth.uid()
  );
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.admin a where a.user_id = auth.uid()) then 'admin'
    else 'tenant'
  end;
$$;

-- 2. สมัครสมาชิก = tenant เสมอ (ไม่ดู admin_allowlist แล้ว) --------
-- เป็นผู้ดูแลได้จากการมีแถวในตาราง admin (server-side insert)

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

  insert into public.profiles (id, email, full_name, phone_number, role)
  values (new.id, new.email, v_full_name, v_phone, 'tenant')
  on conflict (id) do nothing;

  insert into public.tenant (user_id, email, full_name, phone_number, password, room_number)
  values (new.id, new.email, v_full_name, v_phone, '', null)
  on conflict (user_id) do nothing;

  return new;
end $$;

-- 3. mirror profiles.role จากตาราง admin -------------------------
-- (ง่ายกว่าการแก้ client ทุกจุด และทำให้ vacant_rooms / admin-tenants.js ทำงานเหมือนเดิม)

create or replace function public.sync_admin_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set role = 'tenant' where id = old.user_id;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    update public.profiles set role = 'tenant' where id = old.user_id and role = 'admin';
  end if;

  if new.user_id is not null then
    update public.profiles set role = 'admin' where id = new.user_id;
  end if;

  return new;
end $$;

drop trigger if exists admin_role_sync on public.admin;
create trigger admin_role_sync
  after insert or update of user_id or delete on public.admin
  for each row execute function public.sync_admin_to_profile();

-- 4. ย้ายแถว admin เดิมให้อิงกับบัญชีจริง -------------------------

-- 4.1 สร้างแถว admin ให้ผู้ที่เป็นแอดมินอยู่ (profiles.role='admin') แต่ยังไม่มีแถวในตาราง admin
--     คัดลอก password/contact_qr มาจากแถว legacy (user_id is null) ถ้ามี ไม่งั้นใช้ ''
insert into public.admin (full_name, phone_number, contact_qr, password, user_id)
select
  p.full_name,
  p.phone_number,
  coalesce((select a.contact_qr from public.admin a where a.user_id is null limit 1), ''),
  coalesce((select a.password   from public.admin a where a.user_id is null limit 1), ''),
  p.id
from public.profiles p
where p.role = 'admin'
  and not exists (select 1 from public.admin a where a.user_id = p.id);

-- 4.2 แถว billing ที่อ้าง admin_id ของแถว legacy ให้ชี้ไปแถว admin ใหม่แทน (กัน FK พัง)
update public.billing b
set admin_id = n.admin_id
from public.admin n
where n.user_id in (select id from public.profiles where role = 'admin')
  and b.admin_id in (select a.admin_id from public.admin a where a.user_id is null);

-- 4.3 ลบแถว legacy ที่ไม่มีบัญชี auth ผูก (เช่น admin_id 000001)
delete from public.admin where user_id is null;

-- 5. ลบ admin_allowlist ทิ้ง -------------------------------------------------
drop table if exists public.admin_allowlist;

comment on table public.admin is
  'ตารางเดียวที่ระบุบัญชีผู้ดูแล (user_id ชี้ไป auth.users) เพิ่ม/ลบผู้ดูแลผ่าน SQL เท่านั้น';