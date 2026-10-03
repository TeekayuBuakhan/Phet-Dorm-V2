-- เก็บอีเมลไว้ใน profiles เพราะ PostgREST เปิด schema public เท่านั้น
-- client จึงอ่าน auth.users โดยตรงไม่ได้ ต้องซ้ำไว้ฝั่ง public
-- บังคับเบอร์โมือถือ 10 หลัวขึ้นต้นด้วย 0 และห้ามซ้ำกัน

alter table public.profiles
  add column if not exists email text;

-- เติมค่าอีเมลของผู้ใช้ที่มีอยู่แล้วก่อนสร้าง index unique
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

alter table public.profiles
  drop constraint if exists profiles_phone_number_format;

alter table public.profiles
  add constraint profiles_phone_number_format
  check (phone_number is null or phone_number ~ '^0[0-9]{9}$');

create unique index if not exists profiles_phone_number_key
  on public.profiles (phone_number)
  where phone_number is not null;

create unique index if not exists profiles_email_key
  on public.profiles (email)
  where email is not null;

-- สมัครสมาชิกโดยไม่ใส่เบอร์โมือถือ = ไม่ได้
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone_number', '')), '');
begin
  if v_phone is null or v_phone !~ '^0[0-9]{9}$' then
    raise exception 'phone_number is required and must be 10 digits starting with 0'
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, email, full_name, phone_number)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    v_phone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ผู้ใช้เปลี่ยนอีเมลแล้วต้องอัปเดตใน profiles ตาม
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();
