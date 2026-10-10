-- ระบบแจ้งเตือน (notification) ใช้ร่วมกันทั้งผู้ดูแลและผู้เช่า
--
-- การแจ้งเตือนถูกสร้างโดย trigger บนตารางที่เกี่ยวข้องเท่านั้น (billing, room, report)
-- client ไม่มีสิทธิ์ insert/update โดยตรง ยกเว้นการ mark เป็นอ่านแล้วผ่าน RPC notification_mark_read
--
-- เหตุการณ์ที่แจ้งเตือน:
--   1. ผู้เช่าส่งสลิป/แจ้งชำระเงิน  -> แจ้งผู้ดูแล
--   2. ผู้ดูแลเพิ่มห้องสำเร็จ       -> แจ้งผู้ดูแล
--   3. ผู้เช่าแจ้งเรื่องใหม่เข้ามา   -> แจ้งผู้ดูแล
--   4. ผู้ดูแลอัปเดตสถานะคำร้อง    -> แจ้งผู้เช่าของห้องนั้น

-- 1. ตาราง ----------------------------------------------------------------
create table public.notification (
  id bigint generated always as identity primary key,
  recipient_role text not null check (recipient_role in ('admin', 'tenant')),
  recipient_user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  message text not null,
  link text,
  payload jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notification_recipient_idx
  on public.notification (recipient_role, recipient_user_id, created_at desc);
create index notification_unread_idx
  on public.notification (is_read) where is_read = false;

comment on table public.notification is
  'การแจ้งเตือนผู้ดูแล (recipient_role=admin) และผู้เช่า (recipient_role=tenant + recipient_user_id)';

alter table public.notification enable row level security;

drop policy if exists "admin ดูการแจ้งเตือนได้" on public.notification;
create policy "admin ดูการแจ้งเตือนได้" on public.notification
  for select to authenticated
  using (recipient_role = 'admin' and public.is_admin());

drop policy if exists "ผู้เช่าดูการแจ้งเตือนของตัวเองได้" on public.notification;
create policy "ผู้เช่าดูการแจ้งเตือนของตัวเองได้" on public.notification
  for select to authenticated
  using (recipient_role = 'tenant' and recipient_user_id = auth.uid());

-- 2. ฟังก์ชันสร้างการแจ้งเตือน (เรียกจาก trigger เท่านั้น) --------------------
create or replace function public.notify_admin(
  p_title text,
  p_message text,
  p_link text default null,
  p_payload jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification (recipient_role, recipient_user_id, title, message, link, payload)
  values ('admin', null, p_title, p_message, p_link, p_payload);
end;
$$;

create or replace function public.notify_tenant(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_link text default null,
  p_payload jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notification (recipient_role, recipient_user_id, title, message, link, payload)
  values ('tenant', p_user_id, p_title, p_message, p_link, p_payload);
end;
$$;

-- client ใช้ได้เฉพาะ RPC นี้: mark ข้อความของตัวเองเป็นอ่านแล้ว
-- (p_ids = null แปลว่า mark ทั้งหมดที่มองเห็นได้)
create or replace function public.notification_mark_read(p_ids bigint[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ids is null then
    update public.notification set is_read = true
    where is_read = false
      and (public.is_admin() or recipient_user_id = auth.uid());
  else
    update public.notification set is_read = true
    where id = any(p_ids)
      and is_read = false
      and (public.is_admin() or recipient_user_id = auth.uid());
  end if;
end;
$$;

revoke all on function public.notify_admin(text, text, text, jsonb) from public;
revoke all on function public.notify_tenant(uuid, text, text, text, jsonb) from public;
revoke all on function public.notification_mark_read(bigint[]) from public;
grant execute on function public.notification_mark_read(bigint[]) to authenticated;
grant select on public.notification to authenticated;

-- 3. Trigger ตามเหตุการณ์ ---------------------------------------------------

-- 3.1 ผู้เช่าส่งสลิป/แจ้งชำระเงิน -> แจ้งผู้ดูแล
create or replace function public.notify_on_billing_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_admin(
    'ส่งสลิป - ห้อง ' || new.room_number,
    'ห้อง ' || new.room_number || case
      when new.pay_method = 'เงินสด' then ' แจ้งชำระเงินสด'
      else ' ส่งสลิปการโอนเงิน'
    end || ' แล้ว กรุณาตรวจสอบ',
    'Admin_Bill.html',
    jsonb_build_object('bill_id', new.bill_id, 'room_number', new.room_number)
  );
  return new;
end;
$$;

drop trigger if exists billing_submitted_notify on public.billing;
create trigger billing_submitted_notify
  after update on public.billing
  for each row
  when (old.bill_status <> new.bill_status and new.bill_status = 'รออนุมัติการชำระเงิน')
  execute function public.notify_on_billing_submitted();

-- 3.2 ผู้ดูแลเพิ่มห้องสำเร็จ -> แจ้งผู้ดูแล
create or replace function public.notify_on_room_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_admin(
    'เพิ่มห้องสำเร็จ',
    'เพิ่มห้อง ' || new.room_number || ' เข้าในระบบแล้ว',
    'Admin_Room.html',
    jsonb_build_object('room_number', new.room_number)
  );
  return new;
end;
$$;

drop trigger if exists room_added_notify on public.room;
create trigger room_added_notify
  after insert on public.room
  for each row execute function public.notify_on_room_added();

-- 3.3 ผู้เช่าแจ้งเรื่องใหม่ -> แจ้งผู้ดูแล
create or replace function public.notify_on_report_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_admin(
    'มีเรื่องแจ้งเข้ามา',
    'ห้อง ' || new.room_number || ' แจ้งเรื่อง: ' || new.issue_type,
    'Admin_Report.html',
    jsonb_build_object('report_id', new.report_id, 'room_number', new.room_number)
  );
  return new;
end;
$$;

drop trigger if exists report_created_notify on public.report;
create trigger report_created_notify
  after insert on public.report
  for each row execute function public.notify_on_report_created();

-- 3.4 ผู้ดูแลอัปเดตสถานะคำร้อง -> แจ้งผู้เช่าของห้องนั้น
create or replace function public.notify_on_report_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.tenant
  where room_number = new.room_number and user_id is not null
  limit 1;

  if v_user_id is null then return new; end if;

  perform public.notify_tenant(
    v_user_id,
    'ความคืบหน้าการแจ้งเรื่อง',
    'การแจ้งเรื่องห้อง ' || new.room_number || ' (' || new.issue_type || ') อัปเดตเป็น "' || new.report_status || '" แล้ว',
    'Repair.html',
    jsonb_build_object('report_id', new.report_id, 'room_number', new.room_number)
  );
  return new;
end;
$$;

drop trigger if exists report_status_changed_notify on public.report;
create trigger report_status_changed_notify
  after update on public.report
  for each row
  when (old.report_status is distinct from new.report_status and new.report_status <> 'ยังไม่ได้รับเรื่อง')
  execute function public.notify_on_report_status_changed();

-- 4. เปิด Realtime ของตาราง notification (ถ้ามี publication) ----------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notification;
  end if;
exception when duplicate_object then null;
end $$;