-- ชั่วคราว: ดูรายชื่อ trigger ทั้งหมดที่เกี่ยวกับ auth.users และตาราง public เพื่อหาต้นเหตุ
-- ของ error "INSERT has more target columns than expressions"
create or replace function public.diag_triggers()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out text;
begin
  select string_agg(
    format('%I.%I on %I.%I -> %I.%I', n.nspname, t.tgname, tn.nspname, c.relname, pn.nspname, p.proname),
    E'\n' order by tn.nspname, c.relname, t.tgname
  )
  into v_out
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace tn on tn.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  join pg_namespace n on n.oid = t.tgrelid
  where not t.tgisinternal
    and (tn.nspname = 'public' or tn.nspname = 'auth');

  return coalesce(v_out, 'none');
end $$;

grant execute on function public.diag_triggers() to anon;