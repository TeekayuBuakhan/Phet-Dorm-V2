// แสดงรายละเอียดห้องจาก Supabase โดยรับ room_number จาก query string
// ใช้ตาราง room ตรงๆ ไม่ใช่ vacant_rooms เพราะถ้าห้องถูกเช่าไปแล้ว
// ระหว่างที่ผู้ใช้กดเปิดหน้านี้ หน้านี้ยังต้องแสดงข้อมูลได้
//
// room_images เก็บเป็น path ใน Supabase Storage ต้องประกอบ URL ด้วย getPublicUrl()

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

function resolveImageUrl(path) {
    if (!path) return DEFAULT_ROOM_IMAGE;
    // URL เต็มอยู่แล้ว (ข้อมูลเก่า) หรือเป็นพาธในโปรเจกต์ ให้ใช้ค่านั้นเลย
    if (/^https?:\/\//i.test(path) || /^\.{0,2}\//.test(path) || path.startsWith('/')) return path;
    return supabase.storage.from(ROOM_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function formatPrice(price) {
    if (price === null || price === undefined || price === '') return '-';
    return `${Number(price).toLocaleString('th-TH')} บาท`;
}

function renderAdditionalInfo(text) {
    const container = document.getElementById('detailAdditionalInfo');
    const items = (text ?? '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');

    container.innerHTML = items.length
        ? items.map(item => `<li>${escapeHtml(item)}</li>`).join('')
        : '<li class="text-gray-400 list-none">- ไม่มีข้อมูล -</li>';
}

function renderImages(roomImages) {
    const container = document.getElementById('detailImageContainer');
    container.innerHTML = '';

    const paths = Array.isArray(roomImages) ? roomImages.filter(Boolean) : [];
    const sources = paths.length ? paths.map(resolveImageUrl) : [DEFAULT_ROOM_IMAGE];

    for (const src of sources) {
        const img = document.createElement('img');
        img.dataset.fallback = DEFAULT_ROOM_IMAGE;
        img.src = src;
        img.alt = 'รูปห้องพัก';
        img.className = 'rounded-2xl object-cover w-full h-52 cursor-pointer hover:opacity-90 transition-opacity shadow-md';
        img.onclick = () => openImagePreview(img.src);
        img.onerror = function () {
            if (this.src.endsWith(this.dataset.fallback)) return;
            this.src = this.dataset.fallback;
        };
        container.appendChild(img);
    }
}

async function loadRoomDetail() {
    const roomNumber = new URLSearchParams(window.location.search).get('room');

    if (!roomNumber) {
        alert('ไม่พบข้อมูลห้อง กรุณาเลือกห้องใหม่');
        window.location.href = 'vacant_room.html';
        return;
    }

    const { data, error } = await supabase
        .from('room')
        .select('room_number, room_type, room_price, elec_rate, water_rate, additional_info, room_images')
        .eq('room_number', roomNumber)
        .maybeSingle();

    if (error) {
        console.error('โหลดรายละเอียดห้องไม่สำเร็จ:', error);
        alert(`โหลดข้อมูลห้องไม่สำเร็จ: ${error.message}`);
        return;
    }

    if (!data) {
        alert('ไม่พบข้อมูลห้องนี้ในระบบ');
        window.location.href = 'vacant_room.html';
        return;
    }

    document.getElementById('detailRoomNum').innerHTML = `<b>ห้อง :</b> ${escapeHtml(data.room_number)}`;
    document.getElementById('detailRoomType').innerHTML = `<b>ประเภท :</b> ${escapeHtml(data.room_type) || '-'}`;
    document.getElementById('detailRoomPrice').innerHTML = `<b>ค่าห้อง :</b> ${escapeHtml(formatPrice(data.room_price))}`;
    document.getElementById('detailElecRate').innerHTML = `<b>ค่าไฟ :</b> ${data.elec_rate ? `${escapeHtml(data.elec_rate)} บาท / หน่วย` : '-'}`;
    document.getElementById('detailWaterRate').innerHTML = `<b>ค่าน้ำ :</b> ${data.water_rate ? escapeHtml(data.water_rate) : '-'}`;

    renderAdditionalInfo(data.additional_info);
    renderImages(data.room_images);
}

document.addEventListener('DOMContentLoaded', loadRoomDetail);
