-- สมัครสมาชิกและลบบัญชีทดสอบโดยไม่ต้องใช้ Supabase Dashboard
--
-- ปัญหา: ถ้าเปิดยืนยันอีเมลไว้ (ค่าเริ่มต้น) ผู้ใช้ต้องคลิกลิงก์ในอีเมลก่อนเข้าสู่ระบบได้
-- แต่ตอนนี้ยังตั้งค่า Email Template / SMTP ไม่ได้ จึงไม่มีอีเมลมากรีเซิร์ฟ
-- ฟังก์ชันนี้จึงสร้างบัญชีในตาราง auth.users โดยตรง พร้อมตั้งสถานะยืนยันอีเมลให้เรียบร้อย
-- แล้วหน้าเว็บจึงล็อกอินได้ทันทีด้วยอีเมล/รหัสผ่าน
--
-- !! ฟังก์ชันนี้ไม่มีความปลอดภัย จึงทำงานเฉพาะเมื่อ dev_settings.otp_mode = 'on' !!
-- ปิดก่อนขึ้นใช้งานจริง: update public.dev_settings set value = 'off' where key = 'otp_mode';
-- แล้วผู้ใช้ต้องกลับไปสมัครผ่านหน้าเว็บตามปกติ (ต้องตั้งค่าอีเมลให้เรียบร้อยก่อน)

-- สร้างบัญชีใหม่แบบยืนยันอีเมลแล้ว
-- @returns uuid ของผู้ใช้ที่สร้าง หรือ null ถ้าอีเมลนี้มีอยู่แล้ว
create or replace function public.dev_signup(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user_id uuid;
  v_instance_id uuid;
begin
  if not public.dev_otp_enabled() then
    raise exception 'โหมดทดลองปิดอยู่ กรุณาสมัครผ่านหน้าเว็บตามปกติ';
  end if;

  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'อีเมลไม่ถูกต้อง';
  end if;

  if coalesce(p_password, '') = '' or length(p_password) < 6 then
    raise exception 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email) then
    return null;
  end if;

  -- instance_id ของโปรเจกต์ที่โฮสต์โดย Supabase เป็นค่านี้
  -- ถ้ามีผู้ใช้อยู่แล้วให้ยึดค่าจากผู้ใช้คนแรกที่มีอยู่
  select coalesce(
    (select instance_id from auth.users where instance_id is not null limit 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into v_instance_id;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    v_instance_id,
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(coalesce(p_full_name, '')), 'phone_number', trim(coalesce(p_phone, ''))),
    now(),
    now()
  );

  -- identities ต้องมีด้วย ไม่งั้น GoTrue จะมองไม่เห็นบัญชีตอน login
  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_user_id,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  );

  return v_user_id;
end $$;

revoke all on function public.dev_signup(text, text, text, text) from public;
grant execute on function public.dev_signup(text, text, text, text) to anon, authenticated;

-- ลบบัญชีทดสอบ (ใช้ตอนทดสอบเท่านั้น)
-- @returns boolean true ถ้าลบสำเร็จ
create or replace function public.dev_delete_user(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  if not public.dev_otp_enabled() then
    raise exception 'โหมดทดลองปิดอยู่';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(coalesce(p_email, '')));

  if v_user_id is null then
    return false;
  end if;

  -- profiles และ tenant ถูกลบตาม cascade จาก auth.users
  delete from auth.users where id = v_user_id;
  return true;
end $$;

revoke all on function public.dev_delete_user(text) from public;
grant execute on function public.dev_delete_user(text) to anon, authenticated;