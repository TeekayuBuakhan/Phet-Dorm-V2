-- เตรียมข้อมูลผู้เช่าให้ผูกกับบัญชีอีเมลได้จริง เพื่อให้หน้าเว็บดึงข้อมูลจากฐานข้อมูลแทน mock ได้
--
-- 1. เชื่อม tenant เดิมกับ profiles ด้วยเบอร์โทรศัพท์
-- 2. ให้ผู้สมัครใหม่สร้างแถวใน tenant อัตโนมัติ (ยังไม่ผูกห้อง แอดมินเป็นคนจัดสรร)
-- 3. ปิดการอ่าน tenant/report/billing จาก anon เพราะตารางเหล่านี้มีข้อมูลส่วนตัว
--    (คอลัมน์ password เก็บเป็น plain text จึงห้ามเปิดให้ anon อ่านเด็ดขาด)

-- 1. เชื่อม tenant เดิมกับบัญชีอีเมลด้วยเบอร์โทรศัพท์
--    เงื่อนไข: เบอร์นั้นต้องมีใน profiles เพียงบัญชีเดียว และใน tenant เพียงแถวเดียว
--    ไม่งั้นปล่อยให้ admin เป็นคนจับคู่เองในหน้าจัดการผู้เช่า
update public.tenant t
set user_id = p.id
from public.profiles p
where t.user_id is null
  and t.phone_number is not null
  and p.phone_number = t.phone_number
  and (select count(*) from public.profiles p2 where p2.phone_number = t.phone_number) = 1
  and (select count(*) from public.tenant t2 where t2.phone_number = t.phone_number) = 1;

-- 2. ผู้สมัครใหม่ต้องมีแถวใน tenant ด้วย ไม่งั้นจะผูกห้องไม่ได้
--    password เว้นว่างไว้ เพราะรหัสผ่านจริงอยู่ที่ auth.users ไม่ต้องเก็บซ้ำ
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

  insert into public.profiles (id, email, full_name, phone_number)
  values (new.id, new.email, v_full_name, v_phone)
  on conflict (id) do nothing;

  insert into public.tenant (user_id, full_name, phone_number, password, room_number)
  values (new.id, v_full_name, v_phone, '', null)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- 3. จำกัดสิทธิ์ของ anon
--    Supabase ให้ grant all บนตารางใน schema public เป็นค่าเริ่มต้น
--    ต้อง revoke ทิ้งแล้ว grant เฉพาะที่จำเป็น
revoke all on public.tenant  from anon;
revoke all on public.report  from anon;
revoke all on public.billing from anon;
revoke all on public.room    from anon;

-- หน้า "ห้องว่าง" ต้องอ่าน tenant เพื่อเช็คว่าห้องยังไม่มีผู้เช่า
-- แต่ต้องเห็นแค่สองคอลัมน์นี้ ไม่เห็นชื่อ เบอร์โทร หรือรหัสผ่าน
grant select (tenant_id, room_number) on public.tenant to anon;
grant select on public.room to anon;
grant select on public.vacant_rooms to anon;

grant usage, select on all sequences in schema public to authenticated;