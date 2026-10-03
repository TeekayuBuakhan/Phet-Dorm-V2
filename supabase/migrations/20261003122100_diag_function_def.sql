-- ชั่วคราว: ดูนิยามจริงของฟังก์ชันที่ deploy แล้ว เพื่อหาสาเหตุ INSERT ไม่ตรงจำนวนคอลัมน์
create or replace function public.diag_function_def(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def text;
begin
  select string_agg(p.oid::regprocedure::text || E'\n' || pg_get_functiondef(p.oid), E'\n\n')
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_name;

  return coalesce(v_def, 'not found');
end $$;

grant execute on function public.diag_function_def(text) to anon;