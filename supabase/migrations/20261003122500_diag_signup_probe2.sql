-- ชั่วคราว: จับ error ของ dev_signup พร้อมบริบท เพื่อระบุว่าเกิดจากคำสั่งไหน
create or replace function public.diag_signup_probe(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.dev_signup(lower(trim(coalesce(p_email, ''))), 'probepass', 'probe', '0800000000');
  exception when others then
    return 'ERR: ' || sqlerrm || E'\nCTX: ' || coalesce(current_setting('pg_exception_context', true), '<none>');
  end;

  return 'OK';
end $$;

grant execute on function public.diag_signup_probe(text) to anon;