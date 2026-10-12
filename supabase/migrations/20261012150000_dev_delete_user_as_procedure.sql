-- เปลี่ยน dev_delete_user จาก FUNCTION เป็น PROCEDURE
--
-- เหตุผล (ดู docs/stored-procedure-report.md §6-7):
--   - เป็น "workflow แบบ side-effect" (ลบ tenant -> ลบ auth.users) ที่เข้าเค้า PROCEDURE
--   - ไม่มี client เรียกผ่าน supabase.rpc() (ยิงผ่าน SQL/CALL เท่านั้น) -> แปลงได้โดยไม่กระทบหน้าเว็บ
--   - INOUT param ใช้ส่งสถานะผลลัพธ์กลับได้เหมือนการ return value

drop function if exists public.dev_delete_user(text);

create or replace procedure public.dev_delete_user(
  p_email text,
  inout p_success boolean default false
)
language plpgsql
security definer
set search_path = public
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
    p_success := false;
    return;
  end if;

  delete from public.tenant where user_id = v_user_id;
  delete from auth.users where id = v_user_id;

  p_success := true;
end;
$$;

revoke all on procedure public.dev_delete_user(text, boolean) from public;
grant execute on procedure public.dev_delete_user(text, boolean) to anon, authenticated;