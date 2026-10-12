# รายงาน Stored PROCEDURE

---

## 1. สรุป

| หัวข้อ   | รายละเอียด                                                |
| -------- | --------------------------------------------------------- |
| ชื่อ     | `public.dev_delete_user`                                  |
| วันที่   | 2026-10-12 (แปลงจาก FUNCTION เดิม)                        |
| ภาษา     | `plpgsql`, `security definer`, `set search_path = public` |
| เรียกใช้ | `CALL public.dev_delete_user(email)`                      |

---

## 2. Signature และ logic


ขั้นตอนการทำงาน:
1. ตรวจ gate: ถ้า dev_otp_enabled() = false → RAISE EXCEPTION 'โหมดทดลองปิดอยู่'
2. ค้น auth.users จากอีเมล (ไม่区分ใหญ่เล็ก, trim ช่องว่าง)  → ไม่พบ → p_success = false; return
3. DELETE FROM public.tenant WHERE user_id = v_user_id
 4. DELETE FROM auth.users  WHERE id = v_user_id
5. p_success = true

```sql
create or replace procedure public.dev_delete_user(
  p_email text,
  inout p_success boolean default false
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.dev_otp_enabled() then
    raise exception 'โหมดทดลองปิดอยู่';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(coalesce(p_email, '')));

  if v_user_id is null then
    p_success := false;
    return;
  end if;

  delete from public.tenant where user_id = v_user_id;
  delete from auth.users where id = v_user_id;

  p_success := true;
end;
$$;
```

---

## 3. การเรียกใช้

```sql
revoke all on procedure public.dev_delete_user(text, boolean) from public;
grant execute on procedure public.dev_delete_user(text, boolean) to anon, authenticated;
```

---

## 4. ผลการทดสอบ (live DB, 2026-10-12)

| ทดสอบ | คำสั่ง | ผล |
|---|---|---|
| ตรวจ prokind | `select prokind from pg_proc …` | `p` (เป็น PROCEDURE) |
| อีเมลไม่มีอยู่ในระบบ | `call public.dev_delete_user('nonexistent.xyz@example.com');` | `p_success = false` (ไม่มี error) |
| Happy path | `dev_signup` สร้างผู้ใช้ → `call public.dev_delete_user(อีเมล);` | `p_success = true` |
| ตรวจข้อมูลหายจริง | `count(*) from auth.users / public.tenant` | ทั้งสองตาราง = 0 แถว สำหรับอีเมลนั้น |