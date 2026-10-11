-- บังคับราคาห้อง ≥ 1 บาท ป้องกันขั้นสุดท้ายฝั่งฐานข้อมูล
-- (กันค่าศูนย์/ติดลบทะลุเข้า room.room_price ถึงแม้จะลัดหน้าเว็บ)
-- room_price ยังให้เป็น NULL ได้ตามเดิม (ห้องเก่าที่ไม่เคยระบุราคา)

alter table public.room
  drop constraint if exists room_price_min_1;

alter table public.room
  add constraint room_price_min_1
  check (room_price is null or room_price >= 1);