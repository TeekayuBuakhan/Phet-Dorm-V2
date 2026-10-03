-- ตรวจสอบว่า migration ชุดล่าสุด (report/billing/meter) ติดตั้งครบถ้วนจริง
-- ถ้าเงื่อนไขใดไม่ผ่าน จะ raise exception ทำให้ db push ล้มเหลวอย่างชัดเจน
-- ตรวจจากชนิดคำสั่งของ policy แทนการเทียบชื่อ เพื่อไม่ผูกกับภาษาไทยในชื่อ policy
-- ไม่มีการแก้ไขข้อมูลใด ๆ

do $$
declare
  missing_buckets text;
  missing_policies text;
  actual_policies text;
begin
  -- 1. bucket ต้องมีครบทั้งสามตัวและเปิดอ่านแบบสาธารณะ
  select string_agg(required.bucket_id, ', ')
  into missing_buckets
  from (values ('room-images'), ('report-images'), ('bill-slips')) as required(bucket_id)
  where not exists (
    select 1 from storage.buckets b
    where b.id = required.bucket_id and b.public
  );

  if missing_buckets is not null then
    raise exception 'bucket ที่ยังไม่พร้อมใช้งาน: %', missing_buckets;
  end if;

  -- 2. policy ที่จำเป็นต้องมีครบตามคำสั่ง (policy ชนิด ALL ครอบคลุมทุกคำสั่ง)
  select string_agg(required.table_name || '/' || required.cmd, ', ')
  into missing_policies
  from (values
    ('report', 'SELECT'), ('report', 'INSERT'), ('report', 'UPDATE'), ('report', 'DELETE'),
    ('billing', 'SELECT'), ('billing', 'INSERT'), ('billing', 'UPDATE'), ('billing', 'DELETE'),
    ('meter_reading', 'SELECT'), ('meter_reading', 'INSERT'),
    ('meter_reading', 'UPDATE'), ('meter_reading', 'DELETE')
  ) as required(table_name, cmd)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = required.table_name
      and (upper(p.cmd) = required.cmd or upper(p.cmd) = 'ALL')
  );

  if missing_policies is not null then
    select string_agg(p.tablename || ':' || upper(p.cmd), ', ')
    into actual_policies
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('report', 'billing', 'meter_reading');

    raise exception 'policy ที่ยังไม่พร้อมใช้งาน: % (มีอยู่แค่ %)', missing_policies, coalesce(actual_policies, 'ไม่มีเลย');
  end if;

  -- 3. ทุกตารางที่เกี่ยวข้องต้องเปิด RLS
  if exists (
    select 1
    from (values ('profiles'), ('tenant'), ('room'), ('billing'), ('report'), ('meter_reading')) as required(table_name)
    where not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = required.table_name
        and c.relrowsecurity
    )
  ) then
    raise exception 'พบตารางที่ยังไม่ได้เปิด Row Level Security';
  end if;

  -- 4. ค่าเริ่มต้นของสถานะบิลต้องเป็นค่าที่หน้าเว็บใช้
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'billing' and column_name = 'bill_status') is distinct from ('''รอชำระเงิน''::character varying') then
    raise exception 'ค่าเริ่มต้นของ billing.bill_status ไม่ถูกต้อง';
  end if;
end $$;