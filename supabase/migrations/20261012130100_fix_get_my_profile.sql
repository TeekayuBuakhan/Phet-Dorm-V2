-- แก้บัคใน 20261012130000: get_my_profile อ้างคอลัมน์ email ของตาราง admin
-- ที่ไม่มีอยู่จริง (admin ไม่มีคอลัมน์ email -> error 42703 เมื่อเรียก RPC)
-- แก้โดยดึงอีเมลจาก auth.users ตรง ๆ

create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_result jsonb;
begin
  if v_user_id is null then
    return null;
  end if;

  select a.email into v_email from auth.users a where a.id = v_user_id;

  select jsonb_build_object(
    'user_id', user_id,
    'role', 'admin',
    'email', v_email,
    'full_name', full_name,
    'phone_number', phone_number,
    'room_number', null,
    'contact_qr', contact_qr
  )
  into v_result
  from public.admin
  where user_id = v_user_id;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object(
    'user_id', user_id,
    'role', 'tenant',
    'email', coalesce(email, v_email),
    'full_name', full_name,
    'phone_number', phone_number,
    'room_number', room_number,
    'contact_qr', null
  )
  into v_result
  from public.tenant
  where user_id = v_user_id;

  return v_result;
end $$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;