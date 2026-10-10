-- เมื่อสมัครสมาชิก ให้นำข้อมูลไปใส่ในตาราง tenant ให้ครบ (รวมอีเมล)
-- และเพิ่ม FK tenant(user_id) -> profiles(id) เพื่อให้หน้า Admin_Tenant
-- embed profiles(role) ได้ (เดิม PostgREST หา relationship ไม่เจอ -> PGRST200)

-- 0. tenant ยังไม่มีคอลัมน์ email ต้องเพิ่มก่อนที่จะเอาข้อมูลมาเก็บ
alter table public.tenant
  add column if not exists email text;

-- 1. เคลียร์แถว tenant ค้างที่ไม่มี profile (ไม่มีผู้ใช้จริง) ก่อนใส่ FK
delete from public.tenant
where user_id is not null
  and not exists (select 1 from public.profiles p where p.id = public.tenant.user_id);

-- 2. เติมอีเมลย้อนหลังให้แถว tenant เดิมจาก profiles
update public.tenant t
set email = p.email
from public.profiles p
where t.user_id = p.id
  and (t.email is null or t.email = '');

-- 3. ให้ trigger เก็บอีเมลลง tenant ตอนสมัครสมาชิก
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone_number', '')), '');
  v_full_name text;
  v_is_admin boolean;
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

  -- อีเมลที่ลงไว้ใน admin_allowlist คือผู้ดูแล
  v_is_admin := exists (
    select 1 from public.admin_allowlist
    where lower(email) = lower(coalesce(new.email, ''))
  );

  insert into public.profiles (id, email, full_name, phone_number, role)
  values (new.id, new.email, v_full_name, v_phone, case when v_is_admin then 'admin' else 'tenant' end)
  on conflict (id) do nothing;

  -- ผู้ดูแลไม่ต้องมีแถวใน tenant
  if not v_is_admin then
    insert into public.tenant (user_id, email, full_name, phone_number, password, room_number)
    values (new.id, new.email, v_full_name, v_phone, '', null)
    on conflict (user_id) do nothing;
  end if;

  return new;
end $$;

-- 4. เชื่อม FK เพื่อให้ PostgREST embed profiles ได้
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_user_id_fkey_profiles'
      and conrelid = 'public.tenant'::regclass
  ) then
    alter table public.tenant
      add constraint tenant_user_id_fkey_profiles
      foreign key (user_id) references public.profiles(id) on delete set null;
  end if;
end $$;