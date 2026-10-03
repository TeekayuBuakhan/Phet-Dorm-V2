// หน้าตั้งรหัสผ่านใหม่
//
// ทำงานได้เมื่อมีสิทธิ์ตั้งรหัสผ่านอยู่ ได้จาก 2 ทางคือ
//   1. มี session อยู่แล้ว (ล็อกอินค้างไว้ หรือ Supabase สร้าง recovery session ให้)
//   2. ผ่านหน้า otp.html มาแล้วในโหมดจำลอง (เก็บสิทธิ์ไว้ใน sessionStorage)
// ถ้าไม่มีทั้งสองอย่างจะให้กลับไปขอ OTP ใหม่

import { supabase } from '../Client.js';
import { PASSWORD_MIN_LENGTH, getSession } from './auth.js';
import { clearPasswordResetGrant, readPasswordResetGrant } from './dev-otp.js';
import { markInvalid, setBusy, setMessage } from './ui.js';

const form = document.getElementById('resetPasswordForm');
const passwordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const submitBtn = document.getElementById('submitBtn');
const messageBox = document.getElementById('formMessage');

/**
 * รอ session สักครู่ เพราะตอนเปิดหน้านี้จากลิงก์ในอีเมล
 * supabase อาจยังไม่ทันแปลง token ใน url เป็น session
 */
function waitForSession(timeout = 3000) {
    return new Promise((resolve) => {
        let subscription = { unsubscribe() {} };
        let settled = false;

        const finish = (session) => {
            if (settled) return;
            settled = true;
            subscription.unsubscribe();
            resolve(session);
        };

        const listener = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) finish(session);
        });
        subscription = listener.data.subscription;

        setTimeout(async () => {
            try {
                finish(await getSession());
            } catch (error) {
                console.error(error);
                finish(null);
            }
        }, timeout);
    });
}

/**
 * โหมดจำลองไม่มี recovery session จาก Supabase จึงต้องให้ฐานข้อมูลเป็นผู้เปลี่ยนรหัส
 * ฟังก์ชันฝั่งเซิร์ฟเวอร์จะทำงานได้ต่อเมื่อเปิด dev_settings.otp_mode ไว้เท่านั้น
 */
async function resetPasswordWithoutSession(email, password) {
    const { data, error } = await supabase.rpc('reset_password_demo', {
        p_email: email,
        p_password: password,
    });

    if (error) throw new Error(error.message);
    return data === true;
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    markInvalid(passwordInput, false);
    markInvalid(confirmPasswordInput, false);
    setMessage(messageBox, '');

    if (password.length < PASSWORD_MIN_LENGTH) {
        markInvalid(passwordInput, true);
        setMessage(messageBox, `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`);
        return;
    }

    if (password !== confirmPassword) {
        markInvalid(confirmPasswordInput, true);
        setMessage(messageBox, 'รหัสผ่านไม่ตรงกัน');
        return;
    }

    setBusy(submitBtn, true, 'กำลังบันทึก...');

    try {
        const grant = readPasswordResetGrant();
        const session = await getSession();
        const targetEmail = session?.user?.email ?? grant?.email ?? null;

        if (!session) {
            if (!targetEmail) throw new Error('ยังไม่มีสิทธิ์ตั้งรหัสผ่าน กรุณาขอรหัส OTP ก่อน');

            const done = await resetPasswordWithoutSession(targetEmail, password);
            if (!done) throw new Error('ไม่พบบัญชีของอีเมลนี้ กรุณาตรวจสอบอีกครั้ง');
        } else {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw new Error(error.message);
        }

        clearPasswordResetGrant();

        // บังคับให้ล็อกอินใหม่ด้วยรหัสผ่านที่เพิ่งตั้ง
        await supabase.auth.signOut();

        setMessage(messageBox, 'เปลี่ยนรหัสผ่านสำเร็จ กำลังพาไปหน้าเข้าสู่ระบบ...', 'success');
        window.location.href = 'Login.html?reset=1';
    } catch (error) {
        setMessage(messageBox, error.message);
    } finally {
        setBusy(submitBtn, false);
    }
});

// ตรวจสิทธิ์ก่อนให้ผู้ใช้กรอก
setMessage(messageBox, 'กำลังตรวจสอบสิทธิ์การตั้งรหัสผ่าน...', 'info');

waitForSession().then((session) => {
    if (session) {
        setMessage(messageBox, '');
        return;
    }

    if (readPasswordResetGrant()) {
        setMessage(messageBox, '');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
    messageBox.classList.remove('hidden');
    messageBox.className = 'mb-4 text-sm font-medium text-red-600';
    messageBox.innerHTML = 'ยังไม่มีสิทธิ์ตั้งรหัสผ่าน กรุณาขอรหัส OTP ก่อน<br>'
        + '<a href="ForgotPassword.html" class="underline font-bold">ไปหน้าลืมรหัสผ่าน</a>';
});