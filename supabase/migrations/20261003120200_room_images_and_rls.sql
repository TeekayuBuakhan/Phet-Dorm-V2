-- เปลี่ยน room_images จาก text เป็น text[] ให้เก็บหลายรูปได้ตามที่หน้าเว็บคาดหวัง
-- (ค่าที่มีอยู่เดิมคั่นด้วย comma จะถูกแยกเป็น array)

alter table public.room
  alter column room_images type text[]
  using (
    case
      when room_images is null or btrim(room_images) = '' then null
      else string_to_array(btrim(room_images), ',')
    end
  );

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.room     enable row level security;
alter table public.tenant   enable row level security;
alter table public.report   enable row level security;
alter table public.billing  enable row level security;
alter table public.admin    enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists "อ่านโปรไฟล์ตัวเองได้" on public.profiles;
create policy "อ่านโปรไฟล์ตัวเองได้" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "แก้โปรไฟล์ตัวเองได้" on public.profiles;
create policy "แก้โปรไฟล์ตัวเองได้" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role());

-- room -----------------------------------------------------------------------
-- ทุกคน (รวมผู้ที่ยังไม่ล็อกอิน) อ่านข้อมูลห้องได้ เพราะหน้า "ห้องที่ว่าง" เป็นหน้าสาธารณะ
drop policy if exists "ทุกคนอ่านข้อมูลห้องได้" on public.room;
create policy "ทุกคนอ่านข้อมูลห้องได้" on public.room
  for select to anon, authenticated
  using (true);

drop policy if exists "แอดมินเพิ่มห้องได้" on public.room;
create policy "แอดมินเพิ่มห้องได้" on public.room
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "แอดมินแก้ห้องได้" on public.room;
create policy "แอดมินแก้ห้องได้" on public.room
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "แอดมินลบห้องได้" on public.room;
create policy "แอดมินลบห้องได้" on public.room
  for delete to authenticated
  using (public.is_admin());

-- tenant ---------------------------------------------------------------------
drop policy if exists "ผู้เช่าดูข้อมูลตัวเองได้" on public.tenant;
create policy "ผู้เช่าดูข้อมูลตัวเองได้" on public.tenant
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "แอดมินจัดการผู้เช่าได้" on public.tenant;
create policy "แอดมินจัดการผู้เช่าได้" on public.tenant
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- report ---------------------------------------------------------------------
drop policy if exists "ผู้เช่าดูรายงานของห้องตัวเองได้" on public.report;
create policy "ผู้เช่าดูรายงานของห้องตัวเองได้" on public.report
  for select to authenticated
  using (room_number = public.current_room_number() or public.is_admin());

drop policy if exists "ผู้เช่าส่งรายงานได้" on public.report;
create policy "ผู้เช่าส่งรายงานได้" on public.report
  for insert to authenticated
  with check (room_number = public.current_room_number() or public.is_admin());

drop policy if exists "แอดมินจัดการรายงานได้" on public.report;
create policy "แอดมินจัดการรายงานได้" on public.report
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- billing --------------------------------------------------------------------
drop policy if exists "ผู้เช่าดูบิลของห้องตัวเองได้" on public.billing;
create policy "ผู้เช่าดูบิลของห้องตัวเองได้" on public.billing
  for select to authenticated
  using (room_number = public.current_room_number() or public.is_admin());

drop policy if exists "แอดมินจัดการบิลได้" on public.billing;
create policy "แอดมินจัดการบิลได้" on public.billing
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- admin ----------------------------------------------------------------------
-- ยังไม่เปิดให้อ่านผ่าน API เพราะคอลัมน์ password เก็บเป็น plain text
-- ต้องการใช้จริงค่อยเพิ่ม policy ใน migration ถัดไปหลังลบคอลัมน์ password แล้ว
drop policy if exists "อ่านข้อมูลแอดมินได้" on public.admin;

-- ============================================================================
-- Grants
-- ============================================================================

revoke all on public.admin from anon, authenticated;

grant select on public.room to anon, authenticated;
grant insert, update, delete on public.room to authenticated;

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;

grant select, insert, update, delete on public.tenant to authenticated;
grant select, insert, update on public.report to authenticated;
grant select, insert, update, delete on public.billing to authenticated;

-- ให้สิทธิ์ role authenticated ใช้ sequence สร้าง id
-- (loop ตามชื่อจริงใน DB เพื่อไม่ต้องผูกกับชื่อ sequence ที่เดาไว้)
do $$
declare
  seq record;
begin
  for seq in select sequencename from pg_sequences where schemaname = 'public'
  loop
    execute format('grant usage, select on sequence public.%I to authenticated', seq.sequencename);
  end loop;
end;
$$;
