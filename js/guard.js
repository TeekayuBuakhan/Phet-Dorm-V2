// ตัวกันไม่ให้เข้าหน้าที่ต้องล็อกอิน
//
// ใช้ร่วมกันทุกหน้าในโฟลเดอร์ Admin/ และ Tenant/
// บอก role ที่อนุญาตผ่าน data-guard ในแท็ก <body> เช่น
//   <body data-guard="admin">
// ถ้าไม่ล็อกอินจะถูกส่งไปหน้า Login ถ้าล็อกอินแต่ role ไม่ตรงจะถูกส่งไปหน้าหลังของตัวเอง

import { requireRole } from './auth.js';

const allowedRoles = (document.body.dataset.guard ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);

if (allowedRoles.length) {
    requireRole(...allowedRoles);
}