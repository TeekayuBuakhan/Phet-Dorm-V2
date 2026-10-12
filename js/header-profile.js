// แสดงชื่อผู้ใช้ที่ล็อกอินอยู่บนปุ่มบัญชีผู้ใช้ (มุมขวาบน)
//
// ชื่อดึงจากฐานข้อมูลจริง (ผู้เช่า = tenant.full_name / ผู้ดูแล = admin.full_name) ไม่ใช่ชื่อตัวอย่างใน HTML
// ใช้ร่วมกันทุกหน้าในโฟลเดอร์ Admin/ และ Tenant/
//
// ต้องมี element id="profile-name" อยู่ในปุ่ม id="profile-btn"

import { getMyProfile } from './auth.js';

async function mountHeaderProfile() {
    const nameEl = document.getElementById('profile-name');
    if (!nameEl) return;

    try {
        const profile = await getMyProfile();
        if (!profile) return;

        nameEl.textContent = profile.full_name?.trim()
            || profile.email?.split('@')[0]
            || nameEl.textContent;
    } catch (error) {
        console.error('โหลดชื่อผู้ใช้ไม่สำเร็จ', error);
    }
}

mountHeaderProfile();
