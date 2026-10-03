-- ชั่วคราว: ดูคอลัมน์จริงของ auth.users เพื่อแก้ dev_signup ให้ตรงกับโครงสร้างล่าสุด
create or replace function public.diag_user_columns()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cols text;
begin
  select string_agg(column_name || ':' || data_type || coalesce('[' || column_default || ']', ''), ', ' order by column_name)
  into v_cols
  from information_schema.columns
  where table_schema = 'auth' and table_name = 'users';

  return v_cols;
end $$;

grant execute on function public.diag_user_columns() to anon;