-- โครงสร้างพื้นฐานของระบบผู้ใช้ โดยใช้ Supabase Auth (auth.users) เป็นตัวเก็บรหัสผ่าน
-- แทนการเก็บ password เป็น plain text ในตาราง admin/tenant

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'tenant' check (role in ('admin', 'tenant')),
  full_name text,
  phone_number text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'ข้อมูลผู้ใช้ที่เชื่อมกับ auth.users ใช้แบ่งสิทธิ์ admin/tenant';

-- ผูกตารางเดิมเข้ากับ auth.users ด้วย user_id (ยังไม่ลบคอลัมน์ password เดิมทิ้ง
-- เพื่อให้หน้าเว็บเดิมที่ยังใช้ตารางเหล่านี้ไม่พัง)
alter table public.admin
  add column if not exists user_id uuid unique references auth.users (id) on delete set null;

alter table public.tenant
  add column if not exists user_id uuid unique references auth.users (id) on delete set null;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists tenant_user_id_idx on public.tenant (user_id);
create index if not exists admin_user_id_idx on public.admin (user_id);

-- สร้าง profile อัตโนมัติทุกครั้งที่มีผู้ใช้สมัครใหม่
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'phone_number'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ฟังก์ชันช่วยตรวจสิทธิ์ ใช้ร่วมกันทุก policy
-- security definer เพื่อให้อ่านตาราง profiles ได้แม้ RLS ของ profiles จะปิดอยู่
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.current_room_number()
returns character varying
language sql
stable
security definer
set search_path = public
as $$
  select t.room_number from public.tenant t where t.user_id = auth.uid();
$$;

-- ต้องอ่านผ่านฟังก์ชัน security definer เท่านั้น ถ้า query ตาราง profiles ตรงๆ
-- ใน policy ของ profiles จะเกิด infinite recursion
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.current_room_number() from public;
revoke all on function public.current_role() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_room_number() to authenticated;
grant execute on function public.current_role() to authenticated;
