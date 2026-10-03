// เตรียมหน้าออกบิลของผู้ดูแล (Admin/Admin_Bill.html)
//
// หน้านี้เป็น classic script ที่มี inline onclick จึงแยกเฉพาะส่วนที่ต้องใช้ ESM ออกมาไว้ที่นี่
// ได้แก่ การเตรียมตัวเลือกเดือน/ปี และการตรวจสิทธิ์ผู้ดูแล

import { requireRole } from './auth.js';
import { initMonthYearSelectors } from './meters.js';

async function init() {
    const allowed = await requireRole('admin');
    if (!allowed) return;

    initMonthYearSelectors();

    // บอกหน้าเว็บว่าตัวเลือกเดือน/ปีพร้อมแล้ว และยิง event ให้โหลดข้อมูลเดือนที่เลือก
    window.billSelectorsReady = true;
    window.dispatchEvent(new CustomEvent('bill:selectors-ready'));
}

init();