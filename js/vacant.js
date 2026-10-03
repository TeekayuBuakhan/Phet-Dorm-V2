// ดึงข้อมูลห้องที่ว่างจาก Supabase แล้ววาดการ์ดลงใน #vacantRoomContainer
//
// ข้อมูลมาจาก view public.vacant_rooms (ดู supabase/migrations/20261003120300_vacant_rooms_view.sql)
// ซึ่งคืนห้องที่ยังไม่มีผู้เช่าผูกอยู่
//
// room_images เก็บเป็น path ใน Supabase Storage เช่น room-pic001.jpg
// ต้องประกอบ URL เต็มด้วย getPublicUrl() ที่นี่

import { supabase } from '../Client.js';

const ROOM_IMAGE_BUCKET = 'room-images';
const DEFAULT_ROOM_IMAGE = '../img/home.jpg';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// แปลง path ใน Storage เป็น URL ที่เบราว์เซอร์โหลดได้
export function resolveImageUrl(path) {
    if (!path) return DEFAULT_ROOM_IMAGE;
    // URL เต็มอยู่แล้ว (ข้อมูลเก่า) หรือเป็นพาธในโปรเจกต์ ให้ใช้ค่านั้นเลย
    if (/^https?:\/\//i.test(path) || /^\.{0,2}\//.test(path) || path.startsWith('/')) return path;
    return supabase.storage.from(ROOM_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function firstImage(roomImages) {
    const [first] = Array.isArray(roomImages) ? roomImages : [];
    return resolveImageUrl(first);
}

function formatPrice(price) {
    if (price === null || price === undefined || price === '') return '-';
    return `${Number(price).toLocaleString('th-TH')} บาท`;
}

function renderRooms(container, rooms) {
    if (rooms.length === 0) {
        container.innerHTML = '<p class="col-span-full text-center text-2xl font-bold text-gray-800">ขณะนี้ยังไม่มีห้องว่างครับ</p>';
        return;
    }

    for (const room of rooms) {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-3xl shadow-xl overflow-hidden';
        card.innerHTML = `
            <div class="flex p-6 gap-6">
                <img src="${escapeHtml(firstImage(room.room_images))}" data-fallback="${escapeHtml(DEFAULT_ROOM_IMAGE)}" class="w-28 h-28 rounded-xl object-cover" alt="รูปห้อง ${escapeHtml(room.room_number)}">
                <div class="space-y-2 text-lg">
                    <p><b>ห้อง :</b> ${escapeHtml(room.room_number)}</p>
                    <p><b>ประเภท :</b> ${escapeHtml(room.room_type) || '-'}</p>
                    <p><b>ราคา :</b> ${escapeHtml(formatPrice(room.room_price))}</p>
                </div>
            </div>
            <div class="w-full bg-[#D35400] py-3 px-6 flex items-center justify-between">
                <span class="text-white text-lg font-semibold">รายละเอียด</span>
                <button onclick="gotoPage('Detail_vacant_room.html?room=${encodeURIComponent(room.room_number)}')" class="text-white hover:scale-110 transition">
                    <svg width="12" height="21" viewBox="0 0 12 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1.5 19.5L10.5 10.5L1.5 1.5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        `;

        // ถ้าไฟล์ใน Storage ยังไม่มี ให้ใช้รูป default แทน
        card.querySelector('img').onerror = function () {
            if (this.src.endsWith(this.dataset.fallback)) return;
            this.src = this.dataset.fallback;
        };

        container.appendChild(card);
    }
}

async function loadVacantRooms() {
    const container = document.getElementById('vacantRoomContainer');
    container.innerHTML = '<p class="col-span-full text-center text-xl text-gray-500">กำลังโหลดข้อมูลห้องว่าง...</p>';

    const { data, error } = await supabase
        .from('vacant_rooms')
        .select('room_number, room_type, room_price, room_images')
        .order('room_number');

    if (error) {
        console.error('โหลดข้อมูลห้องว่างไม่สำเร็จ:', error);
        container.innerHTML = `
            <div class="col-span-full text-center space-y-2">
                <p class="text-2xl font-bold text-red-600">โหลดข้อมูลห้องว่างไม่สำเร็จ</p>
                <p class="text-gray-500">${escapeHtml(error.message)}</p>
            </div>
        `;
        return;
    }

    renderRooms(container, data ?? []);
}

document.addEventListener('DOMContentLoaded', loadVacantRooms);
