// หน้าเปลี่ยนเบอร์โทรศัพท์ (Login/ReTel.html)
//
// ยืนยันตัวตนด้วย OTP 6 หลักก่อนแก้เบอร์ แล้วบันทึกลงทั้ง profiles และ tenant
// การแก้ tenant ใช้ฟังก์ชัน update_my_phone_number ฝั่งเซิร์ฟเวอร์ เพราะ
// RLS ของตาราง tenant เปิดให้ผู้เช่าแก้ได้เฉพาะผ่านฟังก์ชันนี้เท่านั้น
// (ถ้าแก้ตรง ๆ จะไม่มี policy ที่รองรับ และจะได้ 0 แถวโดยไม่แจ้ง error)

import { supabase } from '../Client.js';
import { PHONE_REGEX, requireRole } from './auth.js';
import { clearOtp as forgetLocalOtp, confirmOtp, requestOtp } from './dev-otp.js';

let currentEmail = null;

function showAlert(message) {
    alert(message);
}

export function gotoPage(page) {
    window.location.href = page;
}

// ให้ปุ่มใน HTML เรียกใช้ได้
window.gotoPage = gotoPage;

async function init() {
    const profile = await requireRole('tenant');
    if (!profile) return;

    const { data } = await supabase.auth.getUser();
    currentEmail = data?.user?.email ?? null;

    document.getElementById('old-phone-input').value = profile.phone_number ?? '-';

    if (!currentEmail) {
        showAlert('ไม่พบอีเมลของผู้ใช้ กรุณาติดต่อผู้ดูแล');
    }
}

async function sendOTP() {
    const newPhone = document.getElementById('new-phone-input').value.trim();

    if (!PHONE_REGEX.test(newPhone)) {
        showAlert('กรุณากรอกเบอร์โทรศัพท์ใหม่ให้ถูกต้อง (ตัวเลข 10 หลักขึ้นต้นด้วย 0)');
        return;
    }

    if (!currentEmail) {
        showAlert('ไม่พบอีเมลของผู้ใช้ กรุณาติดต่อผู้ดูแล');
        return;
    }

    const btn = document.getElementById('send-otp-btn');
    btn.innerText = 'กำลังส่ง...';
    btn.disabled = true;

    try {
        await requestOtp(currentEmail, 'phone');
    } catch (error) {
        showAlert(`ส่งรหัสไม่สำเร็จ: ${error.message}`);
        btn.innerText = 'ส่งรหัส';
        btn.disabled = false;
        return;
    }

    btn.innerText = 'ส่งแล้ว';
    btn.className = 'px-6 py-4 bg-gray-300 text-gray-500 rounded-[24px] font-bold cursor-not-allowed';
}

async function confirmChangePhone() {
    const newPhone = document.getElementById('new-phone-input').value.trim();
    const otp = document.getElementById('otp-input').value.trim();

    if (!PHONE_REGEX.test(newPhone)) {
        showAlert('กรุณากรอกเบอร์โทรศัพท์ใหม่ให้ถูกต้อง (ตัวเลข 10 หลักขึ้นต้นด้วย 0)');
        return;
    }

    if (!/^\d{6}$/.test(otp)) {
        showAlert('กรุณากรอกรหัส OTP 6 หลัก');
        return;
    }

    const valid = await confirmOtp({
        email: currentEmail,
        code: otp,
        purpose: 'phone',
        type: 'email',
    });

    if (!valid) {
        // ล้างรหัสทิ้งทุกครั้งที่ใส่ผิด ไม่ให้เดารหัสซ้ำได้
        forgetLocalOtp();
        showAlert('ยืนยันรหัสไม่สำเร็จ รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว');
        return;
    }

    const { error } = await supabase.rpc('update_my_phone_number', {
        p_phone: newPhone,
    });

    if (error) {
        showAlert(`บันทึกเบอร์โทรศัพท์ไม่สำเร็จ: ${error.message}`);
        return;
    }

    showAlert('บันทึกข้อมูลเรียบร้อยแล้ว!');
    gotoPage('Profile.html');
}

document.getElementById('send-otp-btn').addEventListener('click', sendOTP);
document.getElementById('confirm-change-btn').addEventListener('click', confirmChangePhone);
document.getElementById('otp-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') confirmChangePhone();
});

localStorage.removeItem('userPhone');

init();