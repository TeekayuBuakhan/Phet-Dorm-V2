// หน้าโปรไฟล์ผู้ใช้
//
// ดึงข้อมูลจาก public.profiles ของผู้ใช้ที่ล็อกอินอยู่
// ถ้ายังไม่ได้ล็อกอินจะถูกส่งไปหน้าเข้าสู่ระบบ

import { getMyProfile, requireRole, roleHome } from './auth.js';

const nameLabel = document.getElementById('display-name');
const emailLabel = document.getElementById('display-email');
const phoneLabel = document.getElementById('display-phone');
const saveBtn = document.getElementById('saveBtn');

async function renderProfile() {
    // บังคับล็อกอินก่อน แล้วค่อยอ่านข้อมูล
    const profile = await requireRole('tenant', 'admin');
    if (!profile) return;

    nameLabel.textContent = profile.full_name || '-';
    emailLabel.textContent = profile.email || '-';
    phoneLabel.textContent = profile.phone_number || '-';
}

// หน้านี้ไม่มีช่องให้แก้ไข ปุ่มบันทึกจึงแค่กลับไปหน้าหลัง
saveBtn?.addEventListener('click', async () => {
    const profile = await getMyProfile();
    window.location.href = profile ? roleHome(profile.role) : 'Main_Tenant.html';
});

renderProfile().catch((error) => {
    console.error(error);
    nameLabel.textContent = '-';
    emailLabel.textContent = '-';
    phoneLabel.textContent = '-';
});