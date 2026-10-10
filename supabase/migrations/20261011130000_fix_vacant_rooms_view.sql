-- ปรับ view ห้องว่างให้ตรวจจาก profiles (แหล่งข้อมูลหลัก)
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
  from public.profiles p
  where p.room_number = r.room_number
    and p.role = 'tenant'
);

grant select on public.vacant_rooms to anon, authenticated;

comment on view public.vacant_rooms is 'ห้องที่ยังไม่มีผู้เช่า (ตรวจจาก profiles.role=tenant)';
