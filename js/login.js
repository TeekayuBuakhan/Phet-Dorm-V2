// หน้าเข้าสู่ระบบ
//
// ตัวตนคืออีเมล และหลังล็อกอินสำเร็จจะพาไปหน้าหลังตาม role ที่อยู่ในฐานข้อมูล
// (ผู้ใช้เลือก role เองไม่ได้ ป้องกันการเข้าหน้าแอดมิน)

import { getMyProfile, roleHome, signIn, validateEmail } from './auth.js';
import { markInvalid, setBusy, setMessage } from './ui.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const messageBox = document.getElementById('formMessage');

if (new URLSearchParams(window.location.search).get('reset') === '1') {
    setMessage(messageBox, 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่', 'success');
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    markInvalid(emailInput, false);
    markInvalid(passwordInput, false);
    setMessage(messageBox, '');

    if (!validateEmail(email)) {
        markInvalid(emailInput, true);
        setMessage(messageBox, 'กรุณากรอกอีเมลให้ถูกต้อง');
        return;
    }

    if (!password) {
        markInvalid(passwordInput, true);
        setMessage(messageBox, 'กรุณากรอกรหัสผ่าน');
        return;
    }

    setBusy(submitBtn, true, 'กำลังเข้าสู่ระบบ...');

    try {
        await signIn({ email, password });

        const profile = await getMyProfile();

        if (!profile) {
            // ยังไม่มีข้อมูลใน profiles (เช่นผู้ใช้เก่าที่ยังไม่ได้ยืนยันอีเมล)
            setMessage(messageBox, 'บัญชีนี้ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลหอพัก');
            return;
        }

        window.location.href = roleHome(profile.role);
    } catch (error) {
        setMessage(messageBox, error.message);
        markInvalid(passwordInput, true);
    } finally {
        setBusy(submitBtn, false);
    }
});
