-- ทำให้ profiles เป็นแหล่งข้อมูลหลัก (master) ของผู้ใช้
-- 1) เพิ่ม room_number ใน profiles
-- 2) แปลงแถว legacy ใน tenant (ที่ไม่มีบัญชี) ให้เป็นผู้ใช้จริง (auth.users + profiles + เชื่อม tenant.user_id)
-- 3) กลับทิศทาง sync: profiles -> tenant (tenant ดึงข้อมูลผู้ใช้จาก profiles)
-- 4) เปิดให้ admin แก้ profiles ได้ (ย้ายเข้าออก / แก้ชื่อเบอร์ผู้เช่าผ่านหน้า Admin)

-- 1. เพิ่มคอลัมน์ room_number ให้ profiles พร้อม FK ไปยัง room
alter table public.profiles
  add column if not exists room_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_room_number_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_room_number_fkey
      foreign key (room_number) references public.room (room_number);
  end if;
end $$;
-- 2. แปลง legacy tenant -> ผู้ใช้จริง
-- trigger on_auth_user_created จะ fire ตอน insert auth.users และสร้าง profiles/tenant ให้
-- จึงส่ง raw_user_meta_data.phone_number ที่ผ่าน validation (placeholder) เข้าไป แล้วค่อย
-- ลบ tenant ที่ trigger สร้างซ้ำ + set ค่าจริงใน profiles/legacy row ทีหลัง
-- (หมายเหตุ: ไม่อนุญาตให้ปิด trigger เพราะ postgres ไม่ใช่เจ้าของ auth.users)
do $$
declare
  r record;
  v_email text;
  v_password text;
  v_user_id uuid;
  v_instance_id uuid;
  v_suffix text;
  v_phone text;
  v_placeholder text;
begin
  select coalesce(
    (select instance_id from auth.users where instance_id is not null limit 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into v_instance_id;

  for r in
    select tenant_id, full_name, phone_number, room_number
    from public.tenant
    where user_id is null
    order by tenant_id
  loop
    v_suffix := regexp_replace(r.tenant_id, '[^0-9]', '', 'g');
    v_email := 'phetlegacy' || v_suffix || '@gmail.com';
    v_password := 'PhetLegacy' || v_suffix;
    v_user_id := gen_random_uuid();
    -- ข้อมูล legacy เก่าบางเบอร์ไม่ผ่าน format 0xxxxxxxxx ให้เก็บเป็น NULL แทน
    v_phone := case when r.phone_number ~ '^0[0-9]{9}$' then r.phone_number else null end;
    -- placeholder ผ่าน validation ของ trigger และไม่ซ้ำกัน
    v_placeholder := '0' || lpad(v_suffix, 9, '0');

    -- คอลัมน์ token ทั้งหมดต้องเป็น '' ไม่งั้น GoTrue login ขึ้น 500
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_current, email_change, email_change_token_new,
      phone_change, phone_change_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_instance_id, v_user_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', coalesce(r.full_name, ''), 'phone_number', v_placeholder),
      now(), now()
    );

    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user_id, v_user_id,
      jsonb_build_object('sub', v_user_id, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now());

    -- trigger สร้าง tenant ตัวใหม่ (room null) ให้ลบทิ้ง แล้วผูก legacy row แทน
    delete from public.tenant
    where user_id = v_user_id and room_number is null;

    update public.tenant
    set user_id = v_user_id,
        email = v_email,
        phone_number = v_phone,
        password = ''
    where tenant_id = r.tenant_id;

    -- trigger สร้าง profiles แล้ว (เบอร์เป็น placeholder) ตั้งค่าให้เป็นค่าจริง
    update public.profiles
    set phone_number = v_phone,
        room_number = r.room_number,
        full_name = coalesce(nullif(trim(coalesce(r.full_name, '')), ''), full_name)
    where id = v_user_id;

    raise notice 'สร้างบัญชีให้ legacy %: อีเมล=% รหัสผ่านชั่วคราว=%', r.tenant_id, v_email, v_password;
  end loop;
end $$;

-- สร้าง profiles.room_number ย้อนหลังจาก tenant (ผู้ที่มีบัญชีแล้วแต่ยังไม่มีห้อง)
update public.profiles p
set room_number = t.room_number
from public.tenant t
where t.user_id = p.id
  and p.room_number is null
  and t.room_number is not null;

-- 3. กลับทิศทาง sync เป็น profiles -> tenant
drop trigger if exists tenant_to_profile_sync on public.tenant;
drop function if exists public.sync_tenant_to_profile();

create or replace function public.sync_profile_to_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenant
  set email = new.email,
      full_name = new.full_name,
      phone_number = new.phone_number,
      room_number = new.room_number
  where user_id = new.id;
  return new;
end $$;

drop trigger if exists profile_to_tenant_sync on public.profiles;
create trigger profile_to_tenant_sync
  after update of full_name, email, phone_number, room_number on public.profiles
  for each row execute function public.sync_profile_to_tenant();

-- 4. เปิดให้ admin อัปเดต profiles ได้ (ผู้ใช้แก้ได้เฉพาะแถวตัวเอง และห้ามเปลี่ยน role เอง)
do $$
declare
  r record;
begin
  for r in
    select polname
    from pg_policy
    where polrelid = 'public.profiles'::regclass
      and polcmd in ('w', '*')
  loop
    execute format('drop policy %I on public.profiles', r.polname);
  end loop;
end $$;

create policy "profiles_update_own_or_admin" on public.profiles
  for update
  using (id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (id = auth.uid() and role = public.current_role()));