-- แก้ RPC notification_mark_read ให้แยกขอบเขต admin/tenant
--
-- เดิมวงเล็บ (public.is_admin() or recipient_user_id = auth.uid())
-- ทำให้ admin ที่ mark ทั้งหมดไปโดนการแจ้งเตือนของ tenant ด้วย
-- ตอนนี้ admin จะแตะเฉพาะ recipient_role='admin' และผู้เช่าจะแตะเฉพาะของตัวเอง

create or replace function public.notification_mark_read(p_ids bigint[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ids is null then
    update public.notification set is_read = true
    where is_read = false
      and (
        (recipient_role = 'admin' and public.is_admin())
        or (recipient_role = 'tenant' and recipient_user_id = auth.uid())
      );
  else
    update public.notification set is_read = true
    where id = any(p_ids)
      and is_read = false
      and (
        (recipient_role = 'admin' and public.is_admin())
        or (recipient_role = 'tenant' and recipient_user_id = auth.uid())
      );
  end if;
end;
$$;

revoke all on function public.notification_mark_read(bigint[]) from public;
grant execute on function public.notification_mark_read(bigint[]) to authenticated;