-- Baseline ของฐานข้อมูลที่มีอยู่ก่อนเริ่มใช้ migrations
--
-- หมายเหตุ: ไฟล์นี้ถูกสร้างจาก Schema.sql ที่ export ออกมาจาก Supabase Dashboard
-- (ระบบยังไม่มี Docker/WSL2 จึงไม่สามารถรัน `supabase db pull` เพื่อดึง schema สดได้)
-- และถูก mark เป็น "applied" ด้วย `supabase migration repair` เพื่อไม่ให้รันซ้ำกับตารางที่มีอยู่แล้ว
--
-- ถ้าภายหลังต้องการตรวจความถูกต้อง ให้รัน:
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r';

create sequence if not exists public.admin_id_seq;
create sequence if not exists public.tenant_id_seq;
create sequence if not exists public.report_id_seq;
create sequence if not exists public.billing_id_seq;

create table public.admin (
  admin_id character varying NOT NULL DEFAULT lpad((nextval('public.admin_id_seq'::regclass))::text, 6, '0'::text),
  full_name character varying NOT NULL,
  phone_number character varying NOT NULL,
  contact_qr text NOT NULL,
  password character varying NOT NULL,
  constraint admin_pkey primary key (admin_id)
);

create table public.room (
  room_number character varying NOT NULL,
  room_type character varying,
  room_price integer,
  elec_rate integer default 8,
  water_rate integer default 100,
  additional_info text,
  room_images text,
  constraint room_pkey primary key (room_number)
);

create table public.tenant (
  tenant_id character varying NOT NULL DEFAULT lpad((nextval('public.tenant_id_seq'::regclass))::text, 6, '0'::text),
  full_name character varying NOT NULL,
  phone_number character varying,
  password character varying NOT NULL,
  room_number character varying,
  constraint tenant_pkey primary key (tenant_id),
  constraint tenant_room_number_fkey foreign key (room_number) references public.room (room_number)
);

create table public.report (
  report_id character varying NOT NULL DEFAULT lpad((nextval('public.report_id_seq'::regclass))::text, 6, '0'::text),
  report_date date default CURRENT_DATE,
  issue_type character varying NOT NULL,
  issue_detail text NOT NULL,
  images text,
  report_status character varying NOT NULL,
  room_number character varying,
  constraint report_pkey primary key (report_id),
  constraint report_room_number_fkey foreign key (room_number) references public.room (room_number)
);

create table public.billing (
  bill_id character varying NOT NULL DEFAULT lpad((nextval('public.billing_id_seq'::regclass))::text, 6, '0'::text),
  bill_date date default CURRENT_DATE,
  room_cost integer,
  elec_unit integer,
  elec_cost integer,
  water_cost integer,
  total_amount integer,
  bill_status character varying default 'รอชำระ'::character varying,
  pay_method character varying,
  slip_image text,
  room_number character varying,
  admin_id character varying,
  constraint billing_pkey primary key (bill_id),
  constraint billing_room_number_fkey foreign key (room_number) references public.room (room_number),
  constraint billing_admin_id_fkey foreign key (admin_id) references public.admin (admin_id)
);
