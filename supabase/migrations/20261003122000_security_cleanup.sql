-- เก็บกวาดความปลอดภัยหลังทดสอบโหมดสมัครสมาชิกและ OTP จำลอง
--
-- 1. dev_settings เคยเปิดสิทธิ์ให้ anon/authenticated ตามค่า default ของ Supabase
--    ทำให้ใครก็เปิด/ปิดโหมดทดลองเองได้ ต้องปิดสิทธิ์ ให้อ่านได้ผ่าน dev_otp_enabled() เท่านั้น
-- 2. ลบฟังก์ชันตรวจสอบชั่วคราวที่เปิดให้ anon เรียก เพราะตรวจรหัสผ่านจากฐานข้อมูลได้

revoke all on table public.dev_settings from anon, authenticated;

drop function if exists public.diag_check_login(text);
drop function if exists public.diag_auth_schema();
drop function if exists public.diag_user_columns();

-- dev_signup และ dev_delete_user เปิดให้ anon เรียกได้เฉพาะตอน dev_settings.otp_mode = 'on'
-- ต้องปิดโหมดทดลอง (แก้ค่าในตารางเป็น off) ก่อนขึ้นใช้งานจริง แล้ว revoke ด้วย:
-- revoke execute on function public.dev_signup(text, text, text, text) from anon, authenticated;
-- revoke execute on function public.dev_delete_user(text) from anon, authenticated;