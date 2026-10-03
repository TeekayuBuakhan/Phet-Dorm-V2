-- ชั่วคราว: ทดสอบ insert ทีละคำสั่งเพื่อหาว่าคำสั่งไหนของ auth.users / auth.identities พลาด
create or replace function public.diag_insert_probe(p_email text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_out text := '';
begin
  begin
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_current, email_change,
      email_change_token_new, phone_change, phone_change_token,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000'::uuid, v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt('probepass', extensions.gen_salt('bf')), now(),
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'probe', 'phone_number', '0800000000'),
      now(), now()
    );
    v_out := v_out || 'users insert OK' || E'\n';
  exception when others then
    v_out := v_out || 'users insert ERR: ' || sqlerrm || E'\n';
    return v_out;
  end;

  begin
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_user_id, v_user_id,
      jsonb_build_object('sub', v_user_id, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
    v_out := v_out || 'identities insert OK' || E'\n';
  exception when others then
    v_out := v_out || 'identities insert ERR: ' || sqlerrm || E'\n';
  end;

  select coalesce(string_agg(c.relname || ': ' || p.proname, E'\n'), 'no extra triggers')
  into v_out
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  where c.relname in ('users', 'identities') and not t.tgisinternal;

  return v_out;
end $$;

grant execute on function public.diag_insert_probe(text) to anon;