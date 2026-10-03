-- แก้ dev_signup: ต้องใส่ค่า '' ให้คอลัมน์ token ของ auth.users
--
-- คอลัมน์ confirmation_token / recovery_token / email_change_token_current / email_change_token_new
-- ใน auth.users ถูกอ่านโดย GoTrue ด้วยตัวแปร string ตรง ๆ (ไม่ใช่ pointer)
-- ถ้าค่าเป็น NULL ตอน login จะ scan ไม่ผ่าน และตอบกลับ 500 "Database error querying schema"
-- ค่า default ของคอลัมน์พวกนี้คือ null จึงต้องระบุค่า '' ทุกครั้งที่ insert

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

-- แก้บัญชีที่สร้างผ่าน dev_signup เวอร์ชันเก่าให้ login ได้ โดยอัปเดตเฉพาะคอลัมน์ที่มีจริง
do $$
declare
  v_token_columns constant text[] := array[
    'confirmation_token',
    'recovery_token',
    'email_change_token_current',
    'email_change_token_new'
  ];
  v_assign text;
  v_where text;
begin
  select
    string_agg(format('%I = %L', c.column_name, ''), ', '),
    string_agg(format('%I is null', c.column_name), ' or ')
  into v_assign, v_where
  from information_schema.columns c
  where c.table_schema = 'auth'
    and c.table_name = 'users'
    and c.column_name = any (v_token_columns);

  if v_assign is null then
    return;
  end if;

  execute format('update auth.users set %s where %s', v_assign, v_where);
end $$;