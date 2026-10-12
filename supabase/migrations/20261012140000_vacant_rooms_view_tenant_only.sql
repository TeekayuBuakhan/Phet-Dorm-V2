-- view ห้องว่าง: เปลี่ยนเกณฑ์จาก profiles → tenant
--
-- เดิม view อ้างตาราง public.profiles (ถูก drop ไปใน 20261012130000 ด้วย CASCADE)
-- ทำให้ view หายไป หน้า Vacant/vacant_room.html จึงโหลดห้องว่างไม่ได้
--
-- ห้องว่าง หมายถึง ห้องที่ยังไม่มีผู้เช่า (ไม่มีแถว tenant อ้าง room_number นั้น)

drop view if exists public.vacant_rooms;

create or replace view public.vacant_rooms
with (security_invoker=false)
as
select
  r.room_number,
  r.room_type,
  r.room_price,
  r.elec_rate,
  r.water_rate,
  r.additional_info,
  r.room_images
from public.room r
where not exists (
  select 1
  from public.tenant t
  where t.room_number = r.room_number
);

grant select on public.vacant_rooms to anon, authenticated;

comment on view public.vacant_rooms is 'ห้องที่ยังไม่มีผู้เช่า (ตรวจจาก tenant.room_number)';