// หน้าหลักของผู้ดูแล (Admin/Admin_main.html)
//
// ผูกเบลกริ่งแจ้งเตือน + เรนเดอร์การ์ดการแจ้งเตือนล่าสุดจากฐานข้อมูล
// (ข้อความทุกประเภทสร้างจาก trigger ใน DB ดู migrations/20261010130000_notifications.sql)
// สิทธิ์การเข้าถูกคุมด้วย guard.js (data-guard="admin") แล้ว

import { mountNotificationBell, renderNotificationGrid } from './notifications.js';

const GRID_LIMIT = 3;

const grid = document.getElementById('noti-grid');

mountNotificationBell();

if (grid) {
    renderNotificationGrid(grid, { limit: GRID_LIMIT });

    const seeAll = document.getElementById('noti-see-all');
    if (seeAll) {
        seeAll.addEventListener('click', () => {
            const total = Number(grid.dataset.total ?? '0');
            const showAll = grid.dataset.showAll !== 'true';
            grid.dataset.showAll = String(showAll);
            seeAll.innerText = showAll ? 'ซ่อน' : `ดูทั้งหมด${total > GRID_LIMIT ? ` (${total})` : ''}`;
            renderNotificationGrid(grid, showAll ? {} : { limit: GRID_LIMIT });
        });
        seeAll.classList.remove('hidden');
    }
}