// หน้ากรอก OTP
//
// ใช้กับการลืมรหัสผ่าน (type=recovery) ซึ่งจะได้รหัส 6 หลักจากอีเมล
// ถ้ายังไม่ได้ตั้งค่าอีเมลจริง ระบบจะสุ่มรหัสแล้วขึ้น alert แทน (ดู DEV_OTP_MODE ใน config.js)
// เมื่อยืนยันสำเร็จ Supabase จะสร้าง session ชั่วคราวให้ตั้งรหัสผ่านใหม่ได้
// ถ้าไม่มีอีเมลใน query string แปลว่าเข้าหน้านี้ตรงๆ ให้กลับไปหน้าลืมรหัสผ่าน

import { OTP_LENGTH } from './auth.js';
import { clearOtp as forgetLocalOtp, confirmOtp, requestOtp } from './dev-otp.js';
import { setBusy, setMessage } from './ui.js';

const inputs = [...document.querySelectorAll('.otp-input')];
const submitBtn = document.getElementById('submitBtn');
const resendBtn = document.getElementById('resendBtn');
const messageBox = document.getElementById('formMessage');
const targetEmailLabel = document.getElementById('targetEmail');

const params = new URLSearchParams(window.location.search);
const email = params.get('email') ?? '';
const type = params.get('type') === 'email' ? 'email' : 'recovery';
const purpose = type === 'email' ? 'phone' : 'recovery';

if (!email) {
    // ไม่รู้ว่าจะยืนยันบัญชีไหน ให้กลับไปเริ่มต้นใหม่
    setMessage(messageBox, 'ไม่พบอีเมล กรุณากลับไปกรอกอีเมลใหม่อีกครั้ง', 'error');
    submitBtn.disabled = true;
    resendBtn.disabled = true;
} else {
    targetEmailLabel.textContent = email;
}

// เลื่อนโฟกัสไปช่องถัดไปอัตโนมัติ
inputs.forEach((input, index) => {
    input.addEventListener('input', (event) => {
        event.target.value = event.target.value.replace(/\D/g, '');

        if (event.target.value.length > 0 && index < inputs.length - 1) {
            inputs[index + 1].focus();
        }
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Backspace' && !event.target.value && index > 0) {
            inputs[index - 1].focus();
        }
    });

    // กด Enter ที่ช่องสุดท้ายเพื่อยืนยันได้เลย
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitBtn.click();
        }
    });
});

function readOtp() {
    return inputs.map((input) => input.value).join('');
}

function clearInputs() {
    inputs.forEach((input) => {
        input.value = '';
    });
    inputs[0]?.focus();
}

submitBtn.addEventListener('click', async () => {
    if (!email) return;

    const token = readOtp();
    setMessage(messageBox, '');

    if (token.length !== OTP_LENGTH) {
        setMessage(messageBox, `กรุณากรอกรหัสให้ครบ ${OTP_LENGTH} หลัก`);
        return;
    }

    setBusy(submitBtn, true, 'กำลังตรวจสอบ...');

    try {
        const valid = await confirmOtp({ email, code: token, purpose, type });

        if (!valid) {
            throw new Error('รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว');
        }

        window.location.href = 'ResetPassword.html';
    } catch (error) {
        setMessage(messageBox, error.message);
        forgetLocalOtp();
        clearInputs();
    } finally {
        setBusy(submitBtn, false);
    }
});

resendBtn.addEventListener('click', async () => {
    if (!email) return;

    setMessage(messageBox, '');
    setBusy(resendBtn, true, 'กำลังส่ง...');

    try {
        await requestOtp(email, purpose);
        setMessage(messageBox, 'ส่งรหัสใหม่ไปที่อีเมลแล้ว', 'success');
    } catch (error) {
        setMessage(messageBox, error.message);
    } finally {
        setBusy(resendBtn, false);
    }
});

inputs[0]?.focus();