// หน้าสมัครสมาชิก
//
// สมัครผ่าน Supabase Auth โดยใช้อีเมลเป็นตัวตน
// ชื่อ-นามสกุลกับเบอร์โทรศัพท์จะถูกส่งไปเป็น metadata
// แล้วถูก trigger ฝั่งฐานข้อมูลนำไปสร้างแถวใน profiles ให้อัตโนมัติ
//
// หลังสมัครสำเร็จจะยังเข้าใช้งานไม่ได้จนกว่าจะกดลิงก์ยืนยันในอีเมล

import {
    PASSWORD_MIN_LENGTH,
    signUp,
    validateEmail,
    validatePassword,
    validatePhone,
} from './auth.js';
import { markInvalid, setBusy, setMessage } from './ui.js';

const form = document.getElementById('registerForm');
const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const submitBtn = document.getElementById('submitBtn');
const messageBox = document.getElementById('formMessage');

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    [fullNameInput, emailInput, phoneInput, passwordInput, confirmPasswordInput]
        .forEach((input) => markInvalid(input, false));
    setMessage(messageBox, '');

    if (!fullName) {
        markInvalid(fullNameInput, true);
        setMessage(messageBox, 'กรุณากรอกชื่อ-นามสกุล');
        return;
    }

    if (!validateEmail(email)) {
        markInvalid(emailInput, true);
        setMessage(messageBox, 'กรุณากรอกอีเมลให้ถูกต้อง');
        return;
    }

    if (!validatePhone(phone)) {
        markInvalid(phoneInput, true);
        setMessage(messageBox, 'กรุณากรอกเบอร์โทรศัพท์ 10 หลักขึ้นต้นด้วย 0');
        return;
    }

    if (!validatePassword(password)) {
        markInvalid(passwordInput, true);
        setMessage(messageBox, `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`);
        return;
    }

    if (password !== confirmPassword) {
        markInvalid(confirmPasswordInput, true);
        setMessage(messageBox, 'รหัสผ่านไม่ตรงกัน');
        return;
    }

    setBusy(submitBtn, true, 'กำลังสมัครสมาชิก...');

    try {
        const data = await signUp({ fullName, email, phone, password });

        if (data.session) {
            // กรณีปิดการยืนยันอีเมลไว้ ให้ไปหน้าแรกต่อได้เลย
            window.location.href = '../index.html';
            return;
        }

        form.classList.add('hidden');
        messageBox.classList.remove('hidden');
        messageBox.className = 'mb-4 text-sm font-medium text-green-600';
        messageBox.innerHTML = `สมัครสมาชิกเรียบร้อยแล้ว<br>
            กรุณาเปิดอีเมล <strong>${email.replace(/[<>&]/g, '')}</strong> แล้วกดลิงก์ยืนยันบัญชี<br>
            <a href="Login.html" class="underline font-bold">กลับไปหน้าเข้าสู่ระบบ</a>`;
    } catch (error) {
        setMessage(messageBox, error.message);

        if (/เบอร์โทรศัพท์นี้ถูกใช้/.test(error.message)) markInvalid(phoneInput, true);
        if (/อีเมลนี้มีบัญชีอยู่แล้ว/.test(error.message)) markInvalid(emailInput, true);
    } finally {
        setBusy(submitBtn, false);
    }
});