-- สร้างบัญชีผู้ดูแลโดยไม่ต้องใช้ Supabase Dashboard
--
-- ปกติต้องสร้าง user ใน Dashboard แล้วมาแก้ profiles.role เป็น admin ทีหลัง
-- ถ้าไม่มีสิทธิ์เข้า Dashboard ให้ใช้วิธีในไฟล์นี้แทน
--
-- 1. มีตาราง admin_allowlist ไว้ลงอีเมลที่ต้องการให้เป็นผู้ดูแล
--    trigger จะตั้ง role = 'admin' ให้อัตโนมัติตอนสมัคร และไม่สร้างแถวใน tenant
--    เพิ่มผู้ดูแลคนใหม่ด้วย insert into public.admin_allowlist (email) values ('...');
-- 2. ครั้งนี้เลื่อนบัญชีที่สมัครก่อนหน้านี้คนแรกให้เป็นผู้ดูแลทันที
--    ถ้ายังไม่มีผู้ใช้เลยจะข้ามไปก่อน แล้วค่อยรัน db push อีกครั้งหลังสมัคร

create table if not exists public.admin_allowlist (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.admin_allowlist is
  'อีเมลที่ให้เป็นผู้ดูแลอัตโนมัติตอนสมัคร แก้ได้ผ่าน SQL เท่านั้น';

-- ตารางนี้เป็นข้อมูลตั้งค่า ไม่เกี่ยวกับงานของผู้ใช้ในแอป จึงปิดการเข้าถึงจาก client
revoke all on public.admin_allowlist from anon, authenticated;

-- 1. เลื่อนบัญชีผู้ใช้คนแรกให้เป็นผู้ดูแล
do $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.profiles
  order by created_at asc, id asc
  limit 1;

  if v_id is null then
    raise notice 'ยังไม่มีผู้ใช้ในระบบ ข้ามการเลื่อนสิทธิ์ผู้ดูแล (สมัครสมาชิกแล้วรัน db push ใหม่)';
    return;
  end if;

  update public.profiles set role = 'admin' where id = v_id;

  -- trigger สร้างแถว tenant ให้ทุกคนที่สมัคร ผู้ดูแลไม่ใช่ผู้เช่าจึงเอาออก
  -- เก็บไว้เฉพาะกรณีที่ยังไม่ได้ผูกห้อง
  delete from public.tenant
  where user_id = v_id and room_number is null;

  raise notice 'เลื่อนสิทธิ์ผู้ดูแลให้ % แล้ว', v_id;
end $$;

-- 2. ให้ trigger รองรับรายชื่อผู้ดูแล
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
    insert into public.tenant (user_id, full_name, phone_number, password, room_number)
    values (new.id, v_full_name, v_phone, '', null)
    on conflict (user_id) do nothing;
  end if;

  return new;
end $$;

-- 3. ตรวจว่า trigger ยังทำงานและรู้จักรายชื่อผู้ดูแล
do $$
begin
  if (select count(*) from public.profiles where role = 'admin') = 0 then
    raise notice 'ยังไม่มีผู้ดูแลในระบบ สมัครสมาชิกแล้วรัน db push อีกครั้งเพื่อเลื่อนสิทธิ์อัตโนมัติ';
  else
    raise notice 'มีผู้ดูแลในระบบแล้ว % คน', (select count(*) from public.profiles where role = 'admin');
  end if;
end $$;