-- ชั่วคราว: ตรวจว่า schema ของ auth ได้รับ migration ครบแล้วหรือยัง
create or replace function public.diag_auth_schema()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest text;
  v_count bigint;
  v_tables text;
begin
  select string_agg(version, ', ' order by version desc)
  into v_latest
  from (select version from auth.schema_migrations order by version desc limit 5) t;

  select string_agg(tablename, ', ' order by tablename)
  into v_tables
  from pg_tables
  where schemaname = 'auth'
    and tablename in ('users', 'identities', 'sessions', 'mfa_amr_claims', 'mfa_factors', 'mfa_challenges', 'refresh_tokens', 'flow_state');

  select count(*) into v_count from auth.users;

  return format('auth tables=[%s] latest migrations=[%s] users=%s', v_tables, coalesce(v_latest, '<none>'), v_count);
end $$;

grant execute on function public.diag_auth_schema() to anon;