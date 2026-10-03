-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin (
  admin_id character varying NOT NULL DEFAULT lpad((nextval('admin_id_seq'::regclass))::text, 6, '0'::text),
  full_name character varying NOT NULL,
  phone_number character varying NOT NULL,
  contact_qr text NOT NULL,
  password character varying NOT NULL,
  CONSTRAINT admin_pkey PRIMARY KEY (admin_id)
);
CREATE TABLE public.room (
  room_number character varying NOT NULL,
  room_type character varying,
  room_price integer,
  elec_rate integer DEFAULT 8,
  water_rate integer DEFAULT 100,
  additional_info text,
  room_images text,
  CONSTRAINT room_pkey PRIMARY KEY (room_number)
);
CREATE TABLE public.tenant (
  tenant_id character varying NOT NULL DEFAULT lpad((nextval('tenant_id_seq'::regclass))::text, 6, '0'::text),
  full_name character varying NOT NULL,
  phone_number character varying,
  password character varying NOT NULL,
  room_number character varying,
  CONSTRAINT tenant_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT tenant_room_number_fkey FOREIGN KEY (room_number) REFERENCES public.room(room_number)
);
CREATE TABLE public.report (
  report_id character varying NOT NULL DEFAULT lpad((nextval('report_id_seq'::regclass))::text, 6, '0'::text),
  report_date date DEFAULT CURRENT_DATE,
  issue_type character varying NOT NULL,
  issue_detail text NOT NULL,
  images text,
  report_status character varying NOT NULL,
  room_number character varying,
  CONSTRAINT report_pkey PRIMARY KEY (report_id),
  CONSTRAINT report_room_number_fkey FOREIGN KEY (room_number) REFERENCES public.room(room_number)
);
CREATE TABLE public.billing (
  bill_id character varying NOT NULL DEFAULT lpad((nextval('billing_id_seq'::regclass))::text, 6, '0'::text),
  bill_date date DEFAULT CURRENT_DATE,
  room_cost integer,
  elec_unit integer,
  elec_cost integer,
  water_cost integer,
  total_amount integer,
  bill_status character varying DEFAULT 'รอชำระ'::character varying,
  pay_method character varying,
  slip_image text,
  room_number character varying,
  admin_id character varying,
  CONSTRAINT billing_pkey PRIMARY KEY (bill_id),
  CONSTRAINT billing_room_number_fkey FOREIGN KEY (room_number) REFERENCES public.room(room_number),
  CONSTRAINT billing_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admin(admin_id)
);