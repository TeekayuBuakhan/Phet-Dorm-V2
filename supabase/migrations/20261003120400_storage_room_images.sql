-- Supabase Storage สำหรับรูปภาพห้อง
--
-- bucket ชื่อ room-images เปิดอ่านแบบ public เพราะหน้า "ห้องที่ว่าง" เป็นหน้าสาธารณะ
-- แต่การเขียน (อัปโหลด/ลบ) ต้องเป็นผู้ที่ล็อกอินแล้วเท่านั้น
--
-- ในฐานข้อมูลเก็บแค่ชื่อไฟล์ (path) เช่น room-pic001.jpg
-- ฝั่งหน้าเว็บประกอบ URL เต็มด้วย supabase.storage.from('room-images').getPublicUrl()

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'room-images',
  'room-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- policies ของ storage.objects ต้อง drop ก่อนสร้างใหม่เสมอ ไม่งั้น create policy จะ error
drop policy if exists "ทุกคนอ่านรูปห้องได้" on storage.objects;
create policy "ทุกคนอ่านรูปห้องได้" on storage.objects
  for select
  using (bucket_id = 'room-images');

drop policy if exists "ผู้ล็อกอินอัปโหลดรูปห้องได้" on storage.objects;
create policy "ผู้ล็อกอินอัปโหลดรูปห้องได้" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'room-images');

drop policy if exists "ผู้ล็อกอินแก้รูปห้องได้" on storage.objects;
create policy "ผู้ล็อกอินแก้รูปห้องได้" on storage.objects
  for update to authenticated
  using (bucket_id = 'room-images')
  with check (bucket_id = 'room-images');

drop policy if exists "ผู้ล็อกอินลบรูปห้องได้" on storage.objects;
create policy "ผู้ล็อกอินลบรูปห้องได้" on storage.objects
  for delete to authenticated
  using (bucket_id = 'room-images');
