-- ชั่วคราว: นับและแสดง trigger ทั้งหมดอย่างง่าย ๆ เพื่อหาต้นเหตุของ error ตอน dev_signup
create or replace function public.diag_triggers2()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out text;
begin
  select count(*)::text into v_out from pg_trigger where not tgisinternal;
  v_out := v_out || E'\n';

  select coalesce(string_agg(c.relname || '.' || t.tgname || ' -> ' || p.proname || ' internal=' || t.tgisinternal, E'\n'), 'none')
  into v_out
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  where c.relname in ('users', 'identities', 'profiles', 'tenant', 'room', 'billing', 'report', 'meter_reading');

  return v_out;
end $$;

grant execute on function public.diag_triggers2() to anon;