-- View สำหรับหน้า "ห้องที่ว่าง"
-- ห้องที่ว่าง = ห้องที่ยังไม่มีผู้เช่าผูกอยู่
--
-- security_invoker = true จำเป็นมาก ไม่งั้น view จะ bypass RLS ของตาราง room
-- ทำให้ policy ที่เขียนไว้ไม่มีผล

create or replace view public.vacant_rooms
with (security_invoker = true)
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
left join public.tenant t on t.room_number = r.room_number
where t.tenant_id is null;

grant select on public.vacant_rooms to anon, authenticated;

comment on view public.vacant_rooms is 'ห้องที่ยังไม่มีผู้เช่า ใช้แสดงในหน้าห้องว่าง';
