// ผูกแจ้งเตือนของหน้านี้ (เบลกริ่ง + รายการใน dropdown)
//
// ใช้กับทุกหน้าที่ต้องการแค่เบลกริ่ง ไม่ได้เรนเดอร์การ์ดแจ้งเตือนเพิ่ม
// (ผู้ดูแลทุกหน้ายกเว้นหน้าหลัก และผู้เช่าหน้า Repair / Bill)
// สิทธิ์การเข้าถูกควบคุมด้วย guard.js (data-guard ใน <body>) แล้ว

import { mountNotificationBell } from './notifications.js';

mountNotificationBell();