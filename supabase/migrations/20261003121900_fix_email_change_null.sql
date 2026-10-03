-- แก้ข้อมูลบัญชีที่สร้างผ่าน dev_signup เวอร์ชันก่อนให้ login ได้
--
-- โครงสร้างของ auth.users ที่อ่านคอลัมน์ email_change เป็น string ตรง ๆ (ไม่ใช่ pointer)
-- แต่คอลัมน์นี้ไม่มีค่า default จึงเป็น NULL ได้ ทำให้ login ได้ 500 "Database error querying schema"
-- dev_signup เวอร์ชันปัจจุบันระบุค่า '' ให้อยู่แล้ว ส่วน migration นี้แก้เฉพาะบัญชีที่มีอยู่ก่อน

update auth.users
set email_change = ''
where email_change is null;

update auth.users
set confirmation_token = ''
where confirmation_token is null;

update auth.users
set recovery_token = ''
where recovery_token is null;

update auth.users
set email_change_token_current = ''
where email_change_token_current is null;

update auth.users
set email_change_token_new = ''
where email_change_token_new is null;

update auth.users
set phone_change = ''
where phone_change is null;

update auth.users
set phone_change_token = ''
where phone_change_token is null;

update auth.users
set reauthentication_token = ''
where reauthentication_token is null;