-- ชั่วคราว: ตรวจว่าบัญชีที่สร้างผ่าน dev_signup เข้าสู่ระบบได้จริงไหม
-- เรียกตัวฟังก์ชัน verify เดียวกับตอน login โดยตรง ถ้าผ่านแสดงว่าข้อมูลในฐานถูกต้อง
create or replace function public.diag_check_login(p_email text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user auth.users%rowtype;
  v_identity auth.identities%rowtype;
  v_count bigint;
  v_ok boolean;
begin
  select count(*) into v_count from auth.users;

  select * into v_user from auth.users where lower(email) = lower(trim(coalesce(p_email, '')));
  if v_user.id is null then return 'no user (total=' || v_count || ')'; end if;

  select * into v_identity from auth.identities where user_id = v_user.id;
  if v_identity.user_id is null then return 'no identity'; end if;

  v_ok := (v_identity.provider_id = v_user.id::text)
      and (v_identity.provider = 'email')
      and (v_user.email_confirmed_at is not null)
      and (v_user.deleted_at is null)
      and (v_user.instance_id = '00000000-0000-0000-0000-000000000000'::uuid)
      and (v_user.confirmation_token = '')
      and (v_user.email_change = '')
      and (v_user.email_change_token_new = '')
      and (v_user.recovery_token = '')
      and (v_user.encrypted_password is not null)
      and (v_user.raw_app_meta_data ? 'providers');

  return format(
    'total=%s instance=%s confirmed=%s deleted=%s conf_token=[%s] rec_token=[%s] echange=[%s] echange_new=[%s] providers=%s identity_ok=%s pass_ok=%s anon=%s sso=%s phone=[%s] factors=[%s]',
    v_count,
    v_user.instance_id,
    v_user.email_confirmed_at,
    v_user.deleted_at is not null,
    coalesce(v_user.confirmation_token, '<null>'),
    coalesce(v_user.recovery_token, '<null>'),
    coalesce(v_user.email_change, '<null>'),
    coalesce(v_user.email_change_token_new, '<null>'),
    to_jsonb(coalesce(v_user.raw_app_meta_data -> 'providers', '"<null>"'::jsonb))::text,
    (v_identity.provider_id = v_user.id::text and v_identity.provider = 'email'),
    (v_user.encrypted_password = extensions.crypt('devtest123', v_user.encrypted_password)),
    v_user.is_anonymous,
    v_user.is_sso_user,
    coalesce(v_user.phone, '<null>'),
    to_jsonb(coalesce(v_user.raw_app_meta_data -> 'factors', '"<null>"'::jsonb))::text
  );
end $$;

grant execute on function public.diag_check_login(text) to anon;