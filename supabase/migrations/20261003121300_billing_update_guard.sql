-- ปิดช่องโหว่ที่ policy ทำไม่ได้: ผู้เช่าแก้ตัวเลขในบิลของตัวเองได้
--
-- RLS คุมได้แค่ "แถว" เท่านั้น ถ้าตั้ง policy ให้ผู้เช่า UPDATE แถวตัวเองที่ยังรอชำระ
-- ผู้เช่าจะแก้ room_cost / elec_cost / water_cost / total_amount / bill_date ได้ด้วย
-- เพราะ grant update บนตารางครอบคลุมทุกคอลัมน์
--
-- วิธีแก้คือใช้ trigger ที่ตรวจว่าผู้แก้เป็นผู้ดูแลหรือไม่
-- ถ้าไม่ใช่ผู้ดูแลจะอนุญาตเฉพาะคอลัมน์ที่ต้องให้ผู้เช่าแก้เอง
-- (bill_status, pay_method, slip_image) เท่านั้น

create or replace function public.guard_billing_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ผู้ดูแลแก้ได้ทุกคอลัมน์ตามปกติ
  if public.is_admin() then
    return new;
  end if;

  if new.room_number is distinct from old.room_number
     or new.bill_date is distinct from old.bill_date
     or new.room_cost is distinct from old.room_cost
     or new.elec_unit is distinct from old.elec_unit
     or new.elec_cost is distinct from old.elec_cost
     or new.water_cost is distinct from old.water_cost
     or new.total_amount is distinct from old.total_amount
     or new.bill_id is distinct from old.bill_id then
    raise exception 'แก้ไขรายการค่าใช้จ่ายเองไม่ได้ กรุณาติดต่อผู้ดูแล'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists billing_update_guard on public.billing;
create trigger billing_update_guard
  before update on public.billing
  for each row execute function public.guard_billing_update();

-- กันบิลของห้องเดียวกันในเดือนเดียวกันซ้ำ
-- ถ้ามีข้อมูลซ้ำอยู่แล้วจะหยุดและบอกรายละเอียด ไม่ลบข้อมูลให้อัตโนมัติ
do $$
declare
  duplicated text;
begin
  select string_agg(format('%s / %s (%s รายการ)', room_number, to_char(month, 'YYYY-MM'), cnt), ', ')
  into duplicated
  from (
    select room_number,
           date_trunc('month', bill_date) as month,
           count(*) as cnt
    from public.billing
    group by room_number, date_trunc('month', bill_date)
    having count(*) > 1
  ) duplicates;

  if duplicated is not null then
    raise exception 'พบบิลซ้ำในห้องเดียวกันเดือนเดียวกัน: % กรุณาลบบิลเก่าออกก่อน แล้วค่อยรัน db push อีกครั้ง', duplicated;
  end if;
end $$;

-- ใช้ extract แทน date_trunc เพราะ date_trunc เป็น STABLE จึงนำไปใช้ในนิยาม index ไม่ได้
create unique index if not exists billing_room_month_key
  on public.billing (
    room_number,
    (extract(year from bill_date)),
    (extract(month from bill_date))
  );