// ระบบแจ้งเตือน (เบลกริ่ง / รายการ / การ์ด) ใช้ร่วมกันทั้งหน้าผู้ดูแลและผู้เช่า
//
// ข้อมูลมาจากตาราง notification ซึ่ง RLS จะกรองให้เห็นเฉพาะของตัวเอง
// (ผู้ดูแลเห็นแค่ recipient_role='admin' ผู้เช่าเห็นแค่แถวของ recipient_user_id=ตน)
// การแจ้งเตือนเกิดขึ้นจาก trigger ในฐานข้อมูล ไม่มีการสร้างจากฝั่ง client โดยตรง
// mark เป็นอ่านแล้วจะผ่าน RPC notification_mark_read

import { supabase } from '../Client.js';
import { friendlyError } from './auth.js';

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** แปลงเวลาให้อ่านง่าย เช่น เมื่อกี้ / 5 นาทีที่แล้ว / 12 ต.ค. 69 */
function formatNotiTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60_000) return 'เมื่อกี้';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} นาทีที่แล้ว`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ชม.ที่แล้ว`;

    const date = new Date(ts);
    return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${String(date.getFullYear() + 543).slice(-2)}`;
}

/** โหลดการแจ้งเตือนที่ตัวเองมองเห็นได้ เรียงใหม่ก่อน จำกัด 30 รายการ */
async function loadNotifications() {
    const { data, error } = await supabase
        .from('notification')
        .select('id, title, message, link, payload, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) throw new Error(friendlyError(error));
    return data ?? [];
}

/** จำนวนที่ยังไม่ได้อ่าน (มองเห็นได้เฉพาะแถวของตัวเอง) */
async function unreadCount() {
    const { count, error } = await supabase
        .from('notification')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);

    if (error) throw new Error(friendlyError(error));
    return count ?? 0;
}

/** mark รายการที่ระบุเป็นอ่านแล้ว (null = ทั้งหมดที่มองเห็นได้) */
function markNotificationsRead(ids = null) {
    return supabase.rpc('notification_mark_read', { p_ids: ids });
}

/** เปิด subscribe เรียลไทม์ เจอการแจ้งเตือนใหม่จะเรียก onUpdate */
function subscribeNotifications(onUpdate) {
    const channel = supabase
        .channel('notifications-feed')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notification',
        }, () => {
            onUpdate?.();
        })
        .subscribe();

    return channel;
}

/**
 * สร้างรายการการแจ้งเตือนใน dropdown (หนึ่งรายการ)
 * คลิกแล้ว mark เป็นอ่านแล้วและไปตามลิงก์ของรายการนั้น
 */
function buildNotificationItem(notification) {
    const item = document.createElement('a');
    item.href = notification.link || '#';
    item.className = 'flex items-start text-left p-4 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors cursor-pointer';

    const dot = document.createElement('div');
    dot.className = `w-2 h-2 mt-1.5 rounded-full mr-3 shrink-0 ${notification.is_read ? 'bg-transparent' : 'bg-red-500'}`;
    item.appendChild(dot);

    const body = document.createElement('div');
    body.className = 'flex-1 min-w-0';

    const title = document.createElement('p');
    title.className = `text-sm ${notification.is_read ? 'font-medium text-gray-500' : 'font-bold text-gray-800'}`;
    title.textContent = notification.title;
    body.appendChild(title);

    const message = document.createElement('p');
    message.className = 'text-xs text-gray-500 mt-0.5 leading-relaxed';
    message.textContent = notification.message;
    body.appendChild(message);

    const time = document.createElement('span');
    time.className = 'text-[10px] text-gray-400 mt-1 block';
    time.textContent = formatNotiTime(notification.created_at);
    body.appendChild(time);

    item.appendChild(body);

    if (!notification.is_read) {
        item.addEventListener('click', () => {
            markNotificationsRead([notification.id]);
        });
    }

    return item;
}

/**
 * ผูกเบลกริ่งเข้ากับ badge + รายการใน dropdown
 * โหลดตอนเปิดหน้า ค่อย refresh ตาม interval และมีเรียลไทม์ช่วย (ไม่สำเร็จก็ทำงานตามปกติ)
 */
function initNotificationBell({ badge, list, intervalMs = 12_000 } = {}) {
    let channel = null;

    async function refresh() {
        if (!list) return;
        try {
            const items = await loadNotifications();

            list.innerHTML = '';

            if (!items.length) {
                list.innerHTML = '<div class="p-4 text-sm text-gray-400 text-center">ยังไม่มีการแจ้งเตือน</div>';
            } else {
                const unread = items.filter((n) => !n.is_read).length;
                if (unread > 0) {
                    const header = document.createElement('div');
                    header.className = 'flex justify-between items-center px-4 py-2 border-b border-gray-50';
                    header.innerHTML = `
                        <span class="text-xs font-medium text-gray-400">ยังไม่ได้อ่าน ${unread} รายการ</span>
                        <button type="button" class="text-xs font-bold text-phet-orange hover:underline">อ่านทั้งหมด</button>
                    `;
                    header.querySelector('button').addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        await markNotificationsRead(null);
                        refresh();
                    });
                    list.appendChild(header);
                }

                items.forEach((notification) => list.appendChild(buildNotificationItem(notification)));
            }
        } catch (error) {
            console.error('โหลดการแจ้งเตือนไม่สำเร็จ', error);
        }

        if (badge) {
            try {
                const count = await unreadCount();
                badge.classList.toggle('hidden', count === 0);
            } catch (error) {
                console.error(error);
            }
        }
    }

    if (intervalMs > 0) {
        setInterval(refresh, intervalMs);
    }
    channel = subscribeNotifications(refresh);

    refresh();

    return {
        refresh,
        close() {
            if (channel) supabase.removeChannel(channel);
        },
    };
}

/**
 * ผูกเบลกริ่งของหน้าปัจจุบัน (ใช้ id มาตรฐาน #noti-badge / #noti-list / #noti-btn)
 * เป็นทางเข้าหลักที่หน้าเว็บเรียกใช้ — สิทธิ์การเข้าถูกคุมด้วย guard.js แล้ว
 */
export function mountNotificationBell(options = {}) {
    const bell = initNotificationBell({
        badge: document.getElementById('noti-badge'),
        list: document.getElementById('noti-list'),
        ...options,
    });

    document.getElementById('noti-btn')?.addEventListener('click', () => bell.refresh());

    return bell;
}

/**
 * เรนเดอร์การ์ดแจ้งเตือน (ใช้กับส่วน "การแจ้งเตือน" ในหน้าหลัก Admin)
 * คลิกการ์ดจะ mark เป็นอ่านแล้วและไปตามลิงก์
 * @param {HTMLElement} container
 * @param {{ limit?: number, showRoomBadge?: boolean }} options
 */
export function renderNotificationGrid(container, { limit = 0, showRoomBadge = true } = {}) {
    if (!container) return;

    const roomNumber = (notification) => notification.payload?.room_number ?? null;

    container.innerHTML = '';

    loadNotifications()
        .then((items) => {
            const visible = limit > 0 ? items.slice(0, limit) : items;

            if (!visible.length) {
                container.innerHTML = `
                    <div class="col-span-full bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center text-gray-400">
                        ยังไม่มีการแจ้งเตือน
                    </div>
                `;
                container.dataset.total = '0';
                return;
            }

            visible.forEach((notification) => {
                const card = document.createElement('div');
                card.className = `bg-white rounded-2xl p-6 shadow-sm border cursor-pointer transition hover:shadow-md hover:-translate-y-0.5 ${notification.is_read ? 'border-gray-100' : 'border-orange-200'}`;

                const head = document.createElement('div');
                head.className = 'flex items-start space-x-4 mb-4';
                if (showRoomBadge && roomNumber(notification)) {
                    const badge = document.createElement('div');
                    badge.className = 'w-10 h-10 rounded-lg bg-gray-100 border flex items-center justify-center shrink-0';
                    const badgeText = document.createElement('span');
                    badgeText.className = 'text-xs font-bold text-gray-600';
                    badgeText.textContent = roomNumber(notification);
                    badge.appendChild(badgeText);
                    head.appendChild(badge);
                }
                const title = document.createElement('p');
                title.className = 'font-bold text-lg leading-tight text-gray-800';
                title.textContent = notification.title;
                head.appendChild(title);
                card.appendChild(head);

                const message = document.createElement('p');
                message.className = 'text-gray-600 text-sm mb-4';
                message.textContent = notification.message;
                card.appendChild(message);

                const foot = document.createElement('div');
                foot.className = 'flex justify-between items-center';
                const time = document.createElement('span');
                time.className = 'text-xs text-gray-400';
                time.textContent = formatNotiTime(notification.created_at);
                foot.appendChild(time);

                if (!notification.is_read) {
                    const unread = document.createElement('span');
                    unread.className = 'inline-block w-2.5 h-2.5 bg-red-500 rounded-full';
                    unread.title = 'ยังไม่ได้อ่าน';
                    foot.appendChild(unread);
                }
                card.appendChild(foot);

                if (!notification.is_read) {
                    card.addEventListener('click', () => markNotificationsRead([notification.id]));
                }
                if (notification.link) {
                    card.addEventListener('click', () => window.location.href = notification.link);
                }

                container.appendChild(card);
            });

            container.dataset.total = String(items.length);
        })
        .catch((error) => {
            console.error(error);
            container.innerHTML = `
                <div class="col-span-full bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center text-red-500">
                    โหลดการแจ้งเตือนไม่สำเร็จ
                </div>
            `;
        });
}