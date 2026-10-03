-- แก้ dev_delete_user ให้ลบแถวใน tenant ด้วย
--
-- tenant.user_id เป็น foreign key ชี้ไปที่ auth.users แบบ ON DELETE SET NULL
-- ดังนั้นการลบ auth.users อย่างเดียวจะทิ้งแถวผู้เช่าค้างไว้ (user_id = null)
-- ซึ่งจะโผล่ในหน้ารายชื่อผู้เช่าของผู้ดูแล ต้องลบให้เรียบร้อยก่อน

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

  -- profiles ถูกลบตาม cascade อยู่แล้ว แต่ tenant ใช้ ON DELETE SET NULL จึงต้องลบเอง
  delete from public.tenant where user_id = v_user_id;

  delete from auth.users where id = v_user_id;
  return true;
end $$;

revoke all on function public.dev_delete_user(text) from public;
grant execute on function public.dev_delete_user(text) to anon, authenticated;

-- เก็บกวาดแถวผู้เช่าที่ค้างจากบัญชีทดสอบ (ใช้เบอร์ที่ใช้ตอนทดสอบเท่านั้น)
delete from public.tenant
where user_id is null
  and phone_number in ('0899999999', '0866666666', '0800000000', '0877777777');