-- รองรับการทดสอบโหมดที่ยังตั้งค่าอีเมลจริงไม่ได้
--
-- ปกติการลืมรหัสผ่านใช้ OTP ทางอีเมลของ Supabase ซึ่งต้องตั้งค่า Email Template ก่อน
-- ระหว่างที่ยังตั้งไม่ได้ หน้าเว็บจะสุ่มรหัส 6 หลักขึ้นมาแสดงเป็น alert (ดู DEV_OTP_MODE ใน config.js)
-- แต่การตั้งรหัสผ่านใหม่ต้องแก้ที่ฝั่งเซิร์ฟเวอร์ เพราะผู้ใช้ยังไม่มี session
-- ฟังก์ชันด้านล่างจึงทำหน้าที่แทน Supabase แต่จะทำงานได้ต่อเมื่อเปิด dev_settings.otp_mode ไว้
--
-- !! ปิดโหมดนี้ก่อนขึ้นใช้งานจริง: update public.dev_settings set value = 'off' where key = 'otp_mode'; !!
-- ถ้าปิดแล้วฟังก์ชัน reset_password_demo จะไม่ทำอะไรเลย

create table if not exists public.dev_settings (
  key text primary key,
  value text not null,
  note text,
  updated_at timestamptz not null default now()
);

comment on table public.dev_settings is
  'สวิตช์สำหรับโหมดทดลอง ใช้ปิดฟังก์ชันที่ไม่ปลอดภัยก่อนขึ้นใช้งานจริง';

insert into public.dev_settings (key, value, note)
values ('otp_mode', 'on', 'โหมด OTP จำลอง: เปิดไว้เพื่อทดสอบ ให้เป็น off เมื่อใช้งานจริง')
on conflict (key) do nothing;

-- ตรวจว่าโหมดทดลองเปิดอยู่หรือไม่
create or replace function public.dev_otp_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dev_settings
    where key = 'otp_mode' and value = 'on'
  );
$$;

-- เปลี่ยนรหัสผ่านของผู้ใช้ที่ยังไม่มี session (ใช้เฉพาะโหมดทดลอง)
-- ถ้าปิดโหมดทดลองแล้วฟังก์ชันนี้จะ error ทันที
create or replace function public.reset_password_demo(p_email text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  if not public.dev_otp_enabled() then
    raise exception 'โหมดทดลองปิดอยู่ ไม่สามารถเปลี่ยนรหัสผ่านผ่านช่องทางนี้';
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'ไม่พบอีเมลของผู้ใช้';
  end if;

  if p_password is null or length(p_password) < 6 then
    raise exception 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    return false;
  end if;

  -- เข้ารหัสด้วย bcrypt ตามรูปแบบที่ GoTrue ใช้ตรวจสอบตอน login
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  return true;
end $$;

revoke all on function public.reset_password_demo(text, text) from public;
grant execute on function public.reset_password_demo(text, text) to anon, authenticated;

-- ผู้เช่าเปลี่ยนเบอร์โทรศัพท์ของตัวเองได้
-- ตาราง tenant ไม่มี policy ให้ผู้เช่า UPDATE แม้แต่แถวตัวเอง (กันเผลอแก้ room_number)
-- ฟังก์ชันนี้จึงต้องเป็นทางเดียวที่แก้ได้ และต้องอัปเดตทั้ง profiles กับ tenant ให้ตรงกัน
create or replace function public.update_my_phone_number(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trimmed text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_user_id is null then
    raise exception 'ยังไม่ได้เข้าสู่ระบบ';
  end if;

  if v_trimmed is null or v_trimmed !~ '^0[0-9]{9}$' then
    raise exception 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักและขึ้นต้นด้วย 0';
  end if;

  if exists (
    select 1 from public.profiles
    where phone_number = v_trimmed and id <> v_user_id
  ) then
    raise exception 'เบอร์โทรศัพท์นี้ถูกใช้สมัครไว้แล้ว';
  end if;

  update public.profiles
  set phone_number = v_trimmed
  where id = v_user_id;

  update public.tenant
  set phone_number = v_trimmed
  where user_id = v_user_id;

  return true;
end $$;

revoke all on function public.update_my_phone_number(text) from public;
grant execute on function public.update_my_phone_number(text) to authenticated;

-- ยืนยันว่าฟังก์ชันทำงานได้จริง โดยเรียกด้วยอีเมลที่ไม่มีอยู่จริง
-- คาดว่าคืนค่า false และไม่แก้ข้อมูลใด ๆ
do $$
declare
  v_result boolean;
begin
  if not public.dev_otp_enabled() then
    raise exception 'dev_settings.otp_mode ต้องเป็น on ตอนทดสอบ';
  end if;

  v_result := public.reset_password_demo('ไม่มีบัญชีนี้@example.invalid', 'ทดสอบ1234');

  if v_result then
    raise exception 'ฟังก์ชัน reset_password_demo ตอบกลับผิดปกติ';
  end if;
end $$;