-- เปิด Row Level Security ให้ตารางที่ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น
--
-- admin_allowlist และ dev_settings ไม่มีหน้าเว็บใดอ่าน/เขียนตรง ๆ
-- เข้าถึงได้เฉพาะผ่าน SQL ของผู้ดูแล และฟังก์ชัน SECURITY DEFINER (ทำงานในนามเจ้าของตาราง)
-- จึงตั้งใจไม่สร้าง policy ใดเลย → client (anon/authenticated) ถูกปฏิเสธทั้งหมด
--
-- เหตุผลที่ไม่สร้าง policy: ตารางเหล่านี้ไม่มีกรณีใช้งานจาก client เลย
-- และเจ้าของตาราง (postgres) / service_role จะข้าม RLS อยู่แล้ว
-- (ยืนยันแล้วว่า grants ของ anon/authenticated ถูก revoke ไปก่อนหน้าแล้ว)

revoke all on table public.admin_allowlist from anon, authenticated;
revoke all on table public.dev_settings   from anon, authenticated;

alter table public.admin_allowlist enable row level security;
alter table public.dev_settings   enable row level security;

-- ไม่ force RLS เพราะต้องให้ SECURITY DEFINER (เจ้าของตาราง) และ service_role
-- ยังอ่าน/เขียนได้ตามปกติ

comment on table public.admin_allowlist is
  'อีเมลที่ให้เป็นผู้ดูแลอัตโนมัติตอนสมัคร แก้ได้ผ่าน SQL เท่านั้น (RLS เปิด ไม่มี policy = ปิดจาก client)';

comment on table public.dev_settings is
  'สวิตช์สำหรับโหมดทดลอง ใช้ปิดฟังก์ชันที่ไม่ปลอดภัยก่อนขึ้นใช้งานจริง (RLS เปิด ไม่มี policy = ปิดจาก client)';
