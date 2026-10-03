-- แก้ dev_signup ที่ใส่ค่าไม่ครบ 18 คอลัมน์ (คอลัมน์ token ของ auth.users 7 ตัว แต่ใส่ '' แค่ 6 ค่า)
-- ทำให้ PostgREST ตอบ 42601 "INSERT has more target columns than expressions"
-- ต้องระบุค่า '' ให้ครบทุกคอลัมน์ที่ GoTrue อ่านเป็น string ตรง ๆ ไม่ใช่ NULL
--   confirmation_token, recovery_token, email_change_token_current,
--   email_change, email_change_token_new, phone_change, phone_change_token

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
    confirmation_token,
    recovery_token,
    email_change_token_current,
    email_change,
    email_change_token_new,
    phone_change,
    phone_change_token,
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
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(coalesce(p_full_name, '')), 'phone_number', trim(coalesce(p_phone, ''))),
    now(),
    now()
  );

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

-- ลบฟังก์ชันตรวจสอบชั่วคราวที่เปิดให้ anon เรียก
drop function if exists public.diag_function_def(text);
drop function if exists public.diag_triggers();
drop function if exists public.diag_triggers2();
drop function if exists public.diag_signup_probe(text);
drop function if exists public.diag_insert_probe(text);

-- ลบบัญชีทดสอบที่ถูกสร้างตอนวิเคราะห์หาสาเหตุ
delete from auth.users where email like 'probe%@gmail.com';