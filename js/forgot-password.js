// หน้าลืมรหัสผ่าน
//
// ขอ OTP 6 หลักจากอีเมล แล้วพาไปหน้ากรอก OTP
// ถ้ายังไม่ได้ตั้งค่าอีเมลจริง (DEV_OTP_MODE) ระบบจะสุ่มรหัสแล้วขึ้น alert แทน
// อีเมลต้องถูกส่งต่อผ่าน query string เพราะหน้าถัดไปต้องใช้ค่านี้ซ้ำ

import { validateEmail } from './auth.js';
import { requestOtp } from './dev-otp.js';
import { markInvalid, setBusy, setMessage } from './ui.js';

const form = document.getElementById('forgotPasswordForm');
const emailInput = document.getElementById('email');
const submitBtn = document.getElementById('submitBtn');
const messageBox = document.getElementById('formMessage');

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();

    markInvalid(emailInput, false);
    setMessage(messageBox, '');

    if (!validateEmail(email)) {
        markInvalid(emailInput, true);
        setMessage(messageBox, 'กรุณากรอกอีเมลให้ถูกต้อง');
        return;
    }

    setBusy(submitBtn, true, 'กำลังส่งรหัส...');

    try {
        await requestOtp(email, 'recovery');

        setMessage(messageBox, 'ส่งรหัสยืนยันไปที่อีเมลแล้ว กำลังพาไปหน้ากรอกรหัส...', 'success');

        window.location.href = `otp.html?type=recovery&email=${encodeURIComponent(email)}`;
    } catch (error) {
        setMessage(messageBox, error.message);
    } finally {
        setBusy(submitBtn, false);
    }
});