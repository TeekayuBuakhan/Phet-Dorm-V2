-- เพิ่มบัญชีผู้ดูแลสำหรับทดสอบระบบล็อกอิน
--
-- ขั้นที่ 1: ลงอีเมลใน admin_allowlist เพื่อให้ trigger ตั้ง role = 'admin' และไม่สร้างแถวใน tenant
-- ขั้นที่ 2: สร้างบัญชีจริงผ่าน RPC dev_signup (ยืนยันอีเมลอัตโนมัติ) แล้วจึงล็อกอินได้ทันที

insert into public.admin_allowlist (email, note)
values ('admin001@gmail.com', 'บัญชีผู้ดูแลสำหรับทดสอบระบบ')
on conflict (email) do nothing;

select public.dev_signup(
  'admin001@gmail.com',
  'Admin123456789',
  'ผู้ดูแลระบบ',
  '0812345678'
);