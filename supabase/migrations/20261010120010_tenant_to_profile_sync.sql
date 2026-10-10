-- ซิงก์ข้อมูลจากตาราง tenant ไปเก็บไว้ใน profiles
--
-- เมื่อมีผู้เช่าระบุ user_id (คือผู้ใช้ที่สมัครผ่านระบบ) และมีการแก้ไข
-- email / full_name / phone_number ใน tenant ให้อัปเดตเก็บลง profiles ตาม
-- (หน้า Admin + ส่วนแก้ข้อมูลจะได้เห็นข้อมูลตรงกัน)
-- ย้ายเข้า/ออกจะแก้แค่ room_number จึงไม่กระทบ trigger นี้

-- 1. เติมช่องว่างใน profiles จาก tenant (ไม่ทับค่าที่มีอยู่)
update public.profiles p
set email = coalesce(p.email, t.email),
    full_name = coalesce(p.full_name, t.full_name),
    phone_number = coalesce(p.phone_number, t.phone_number)
from public.tenant t
where t.user_id = p.id;

-- 2. trigger ซิงก์ tenant -> profiles
create or replace function public.sync_tenant_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    update public.profiles
    set email = case when coalesce(new.email, '') <> '' then new.email else profiles.email end,
        full_name = case when coalesce(new.full_name, '') <> '' then new.full_name else profiles.full_name end,
        phone_number = case when coalesce(new.phone_number, '') <> '' then new.phone_number else profiles.phone_number end
    where id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists tenant_to_profile_sync on public.tenant;
create trigger tenant_to_profile_sync
  after insert or update of email, full_name, phone_number on public.tenant
  for each row execute function public.sync_tenant_to_profile();