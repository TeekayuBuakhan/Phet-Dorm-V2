-- รองรับการชำระเงิน/ส่งสลิปและการออกบิลของผู้ดูแล
--
-- 1. ทำค่าเริ่มต้นของ bill_status ให้เป็นค่าที่หน้าเว็บใช้จริง
-- 2. normalize บิลเดิมที่มีสถานะผิดรูปแบบ (เช่นค่าที่คัดลอกมาเป็นอักขระแปลก)
-- 3. bucket สำหรับสลิปการโอนเงิน
-- 4. ให้ผู้เช่าอัปเดตบิลของห้องตัวเองได้เฉพาะตอนที่ยังไม่ได้ส่งสลิป

-- 1 & 2. สถานะบิลมาตรฐาน ---------------------------------------------------
alter table public.billing
  alter column bill_status set default 'รอชำระเงิน';

update public.billing
set bill_status = 'รอชำระเงิน'
where bill_status is null
   or bill_status not in ('รอชำระเงิน', 'รออนุมัติการชำระเงิน', 'ชำระเงินแล้ว');

-- 3. bucket สลิปการโอนเงิน ------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bill-slips', 'bill-slips', true)
on conflict (id) do nothing;

drop policy if exists "ทุกคนดูสลิปได้" on storage.objects;
create policy "ทุกคนดูสลิปได้" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'bill-slips');

drop policy if exists "อัปโหลดสลิปของห้องตัวเองได้" on storage.objects;
create policy "อัปโหลดสลิปของห้องตัวเองได้" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bill-slips'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_room_number()
    )
  );

drop policy if exists "ลบสลิปของห้องตัวเองได้" on storage.objects;
create policy "ลบสลิปของห้องตัวเองได้" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bill-slips'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_room_number()
    )
  );

-- 4. ผู้เช่าส่งสลิปของห้องตัวเอง -------------------------------------------
drop policy if exists "ผู้เช่าส่งสลิปของห้องตัวเองได้" on public.billing;
create policy "ผู้เช่าส่งสลิปของห้องตัวเองได้" on public.billing
  for update to authenticated
  using (
    room_number = public.current_room_number()
    and bill_status = 'รอชำระเงิน'
  )
  with check (
    room_number = public.current_room_number()
    and bill_status in ('รอชำระเงิน', 'รออนุมัติการชำระเงิน')
  );