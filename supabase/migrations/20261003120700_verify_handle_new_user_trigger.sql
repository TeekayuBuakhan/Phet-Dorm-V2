-- ตรวจสอบว่า trigger public.handle_new_user() สร้างโปรไฟล์ให้ผู้สมัครสมาชิกใหม่ได้จริง
-- เนื่องจากต้องการ insert เข้า auth.users ซึ่งทำได้จาก SQL เท่านั้น
-- เมื่อผ่านจะลบผู้ใช้และโปรไฟล์ที่สร้างเพื่อทดสอบทิ้งทั้งหมด

do $$
declare
  v_user_id uuid;
  v_rows int;
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  values (
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'trigger-check@invalid.example',
    'x',
    now(),
    '{}'::jsonb,
    '{"full_name":"ทดสอบระบบ","phone_number":"0812345678"}'::jsonb
  )
  returning id into v_user_id;

  select count(*) into v_rows
  from public.profiles
  where id = v_user_id
    and email = 'trigger-check@invalid.example'
    and phone_number = '0812345678'
    and full_name = 'ทดสอบระบบ';

  if v_rows <> 1 then
    raise exception 'handle_new_user ไม่ได้สร้างโปรไฟล์ให้ถูกต้อง (พบ % แถว)', v_rows;
  end if;

  delete from public.profiles where id = v_user_id;
  delete from auth.users where id = v_user_id;

  raise notice 'ตรวจสอบ handle_new_user ผ่าน และลบข้อมูลทดสอบเรียบร้อยแล้ว';
end $$;