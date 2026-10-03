// ค่าการเชื่อมต่อ Supabase สำหรับฝั่งเบราว์เซอร์
//
// ทั้ง URL และ anon key เป็นค่าสาธารณะที่ Supabase ออกให้ใช้ในเบราว์เซอร์ได้
// ความปลอดภัยไม่ได้มาจากการซ่อน key แต่มาจาก Row Level Security ที่ตั้งไว้ใน migration
//
// ห้ามใส่ service_role key ลงไฟล์นี้เด็ดขาด เพราะจะทำให้ข้าม RLS ได้ทั้งระบบ

export const SUPABASE_URL = 'https://vhhqwimygmkfrtjmdegl.supabase.co';

// โหมดทดลอง: รหัส OTP ไม่ได้ส่งทางอีเมลจริง แต่จะสุ่มขึ้นมาแสดงเป็น alert ในเบราว์เซอร์
// เหตุผลคือยังตั้งค่า Email Template ใน Supabase Dashboard ไม่ได้
// ต้อง set เป็น false ก่อนขึ้นใช้งานจริง แล้วทำตามขั้นตอน
//   1. ใส่ {{ .Token }} ใน Email Template แบบ Reset Password และ Magic Link
//   2. ตั้ง Site URL / Redirect URLs ให้ตรงกับที่เปิดเว็บ
export const DEV_OTP_MODE = true;

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoaHF3aW15Z21rZnJ0am1kZWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDIxNjQsImV4cCI6MjEwNDM3ODE2NH0.0Z3khhMydAlRD83SUm8wFW3LhzyM1WUm5aL9WdzeDb0';
