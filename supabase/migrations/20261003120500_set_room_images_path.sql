-- ตั้งค่า room_images ให้เก็บเป็น path ของไฟล์ใน Supabase Storage
-- (เดิมเก็บเป็นชื่อไฟล์ที่ไม่มีอยู่จริง เช่น 23A_img001.png)
--
-- ทุกห้องใช้รูปเดียวกันคือ room-pic001.jpg
-- ถ้าภายหลังอยากให้แต่ละห้องรูปไม่เหมือนกัน ให้แก้ค่าในตาราง room ได้เลย

update public.room
set room_images = array['room-pic001.jpg']::text[]
where room_images is null
   or cardinality(room_images) = 0
   or room_images[1] = '23A_img001.png';
