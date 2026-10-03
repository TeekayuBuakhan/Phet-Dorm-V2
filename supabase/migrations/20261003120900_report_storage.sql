-- รองรับการแจ้งเรื่อง/แจ้งซ่อมผ่าน Supabase
--
-- 1. bucket สำหรับเก็บรูปที่แนบมากับคำร้อง
-- 2. ให้ผู้เช่ายกเลิกคำร้องของตัวเองได้ ถ้ายังไม่ได้รับเรื่อง
-- 3. ให้ผู้ดูแลลบรายงานได้

-- 1. bucket รูปภาพของคำร้อง ------------------------------------------------
insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', true)
on conflict (id) do nothing;

drop policy if exists "ทุกคนดูรูปแจ้งเรื่องได้" on storage.objects;
create policy "ทุกคนดูรูปแจ้งเรื่องได้" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'report-images');

drop policy if exists "ผู้เช่าอัปโหลดรูปแจ้งเรื่องได้" on storage.objects;
create policy "ผู้เช่าอัปโหลดรูปแจ้งเรื่องได้" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-images'
    and (storage.foldername(name))[1] = public.current_room_number()
  );

drop policy if exists "ลบรูปในโฟลเดอร์ของห้องตัวเองได้" on storage.objects;
create policy "ลบรูปในโฟลเดอร์ของห้องตัวเองได้" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'report-images'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_room_number()
    )
  );

-- 2. ผู้เช่ายกเลิกคำร้องได้ถ้ายังไม่ได้รับเรื่อง --------------------------
drop policy if exists "ผู้เช่ายกเลิกคำร้องของตัวเองได้" on public.report;
create policy "ผู้เช่ายกเลิกคำร้องของตัวเองได้" on public.report
  for delete to authenticated
  using (
    room_number = public.current_room_number()
    and report_status = 'ยังไม่ได้รับเรื่อง'
  );

-- 3. ผู้ดูแลลบรายงานได้ -----------------------------------------------------
drop policy if exists "แอดมินลบรายงานได้" on public.report;
create policy "แอดมินลบรายงานได้" on public.report
  for delete to authenticated
  using (public.is_admin());

grant delete on public.report to authenticated;