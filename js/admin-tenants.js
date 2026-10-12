// หน้าจัดการผู้เช่าของผู้ดูแล (Admin/Admin_Tenant.html)
//
// รายชื่อผู้เช่ามาจากตาราง tenant (ซึ่งสร้างอัตโนมัติตอนสมัครสมาชิก)
// การ "ย้ายเข้า/ย้ายออก" คือการใส่หรือล้างค่า room_number ของผู้เช่า

import { supabase } from '../Client.js';
import { friendlyError, requireRole } from './auth.js';
import { escapeHtml, setMessage } from './ui.js';

const tbody = document.getElementById('tenantBody');
const searchInput = document.getElementById('searchInput');
const moveInModal = document.getElementById('moveInModal');
const moveOutModal = document.getElementById('moveOutModal');
const moveInMessage = document.getElementById('moveInMessage');
const moveOutMessage = document.getElementById('moveOutMessage');

let tenants = [];
let roomFilter = 'all';
let moveInTenant = null;
let moveOutTenant = null;

function normalize(value) {
    return String(value ?? '').trim().toLowerCase();
}

// เรียงตามเลขห้องแบบตัวอักษร A-Z บัญชีที่ยังไม่มีห้องให้อยู่ล่างสุด
function sortByRoom(a, b) {
    const ra = a.room_number;
    const rb = b.room_number;
    if (!ra && !rb) return 0;
    if (!ra) return 1;
    if (!rb) return -1;
    return String(ra).localeCompare(String(rb), 'th', { sensitivity: 'base' });
}

function formatPhone(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (digits.length !== 10) return phone || '-';
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

async function fetchTenants() {
    const { data, error } = await supabase
        .from('tenant')
        .select('tenant_id, user_id, full_name, email, phone_number, room_number')
        .order('tenant_id');

    if (error) throw new Error(friendlyError(error));

    // tenant มีเฉพาะผู้เช่า (แอดมินไม่มีแถวใน tenant) จึงแสดงทั้งหมดได้ทันที
    return data ?? [];
}

function renderTable() {
    tbody.innerHTML = '';

    const withRoom = tenants.filter((tenant) => tenant.room_number).length;
    document.getElementById('statTotal').innerText = tenants.length;
    document.getElementById('statWithRoom').innerText = withRoom;
    document.getElementById('statNoRoom').innerText = tenants.length - withRoom;

    if (tenants.length === 0) {
        tbody.innerHTML = '<tr class="border-b border-gray-50"><td colspan="6" class="py-10 text-gray-400">ยังไม่มีผู้เช่าในระบบ</td></tr>';
        return;
    }

    const visible = tenants.filter((tenant) => {
        if (roomFilter === 'with') return Boolean(tenant.room_number);
        if (roomFilter === 'without') return !tenant.room_number;
        return true;
    });

    if (roomFilter !== 'without') visible.sort(sortByRoom);

    if (visible.length === 0) {
        tbody.innerHTML = '<tr class="border-b border-gray-50"><td colspan="6" class="py-10 text-gray-400">ไม่มีผู้เช่าที่ตรงกับตัวกรอง</td></tr>';
        return;
    }

    visible.forEach((tenant, rowIndex) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50 hover:bg-gray-50/50 transition-colors';

        const index = tenants.indexOf(tenant);

        const roomHtml = tenant.room_number
            ? `<span class="inline-block bg-green-100 text-green-700 font-bold rounded-full px-3 py-1 text-xs border border-green-200">${escapeHtml(tenant.room_number)}</span>`
            : '<span class="text-gray-400">-</span>';

        const actionHtml = tenant.room_number
            ? `<button class="btn-move-out inline-flex items-center gap-1.5 bg-red-50 text-red-500 border border-red-200 hover:bg-red-500 hover:text-white font-medium rounded-xl px-4 py-2 text-xs transition-colors" data-idx="${index}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
                ย้ายออก
            </button>`
            : `<button class="btn-move-in inline-flex items-center gap-1.5 bg-btn-green text-white hover:bg-emerald-500 font-medium rounded-xl px-4 py-2 text-xs transition-colors shadow-sm" data-idx="${index}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5m10 0h-5V4m0 9h5v5M4 20h7m-7-4h7m4-5v6" /></svg>
                ย้ายเข้า
            </button>`;

        tr.innerHTML = `
            <td class="py-4 px-4 text-gray-400">${rowIndex + 1}</td>
            <td class="py-4 px-4 font-medium text-gray-800">${escapeHtml(tenant.full_name || '-')}</td>
            <td class="py-4 px-4">${escapeHtml(tenant.email || '-')}</td>
            <td class="py-4 px-4">${escapeHtml(formatPhone(tenant.phone_number))}</td>
            <td class="py-4 px-4">${roomHtml}</td>
            <td class="py-4 px-4">${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    filterTable();
}

function applyRoomFilter() {
    document.querySelectorAll('.filter-btn').forEach((btn) => {
        const active = btn.dataset.filter === roomFilter;
        btn.classList.toggle('bg-phet-orange', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('border-phet-orange', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('bg-white', !active);
        btn.classList.toggle('text-gray-500', !active);
        btn.classList.toggle('border-gray-200', !active);
        btn.classList.toggle('hover:bg-gray-100', !active);
        btn.classList.toggle('hover:border-gray-200', !active);
    });
}

function filterTable() {
    const keyword = (searchInput?.value ?? '').trim().toLowerCase();

    [...tbody.rows].forEach((row) => {
        const text = row.textContent ?? '';
        row.style.display = !keyword || text.toLowerCase().includes(keyword) ? '' : 'none';
    });
}

async function refresh() {
    tenants = await fetchTenants();
    renderTable();
}

// ---- ย้ายเข้า ----

function openMoveInModal(tenant) {
    moveInTenant = tenant;
    document.getElementById('moveInUserName').innerText = tenant.full_name || '-';
    document.getElementById('moveInRoomNum').value = '';
    setMessage(moveInMessage, '');
    moveInModal.classList.replace('hidden', 'flex');
}

function closeMoveInModal() {
    moveInModal.classList.replace('flex', 'hidden');
    moveInTenant = null;
}

async function confirmMoveIn() {
    if (!moveInTenant) return;

    setMessage(moveInMessage, '');

    const roomNumber = document.getElementById('moveInRoomNum').value.trim();
    if (!roomNumber) {
        setMessage(moveInMessage, 'กรุณากรอกเลขห้อง');
        return;
    }

    const { data: room } = await supabase
        .from('room')
        .select('room_number, tenant(tenant_id)')
        .eq('room_number', roomNumber)
        .maybeSingle();

    if (!room) {
        setMessage(moveInMessage, 'ไม่พบห้องนั้นในระบบ');
        return;
    }

    if (room.tenant?.length) {
        setMessage(moveInMessage, `ห้อง ${room.room_number} มีผู้พักอาศัยอยู่แล้ว`);
        return;
    }

    if (!moveInTenant.user_id) {
        setMessage(moveInMessage, 'ผู้ใช้รายนี้ยังไม่มีบัญชีในระบบ');
        return;
    }

    const { error } = await supabase
        .from('tenant')
        .update({ room_number: roomNumber })
        .eq('user_id', moveInTenant.user_id);

    if (error) {
        setMessage(moveInMessage, friendlyError(error));
        return;
    }

    closeMoveInModal();
    await refresh();
}

// ---- ย้ายออก ----

function openMoveOutModal(tenant) {
    moveOutTenant = tenant;
    document.getElementById('moveOutConfirmText').innerText =
        `ยืนยันที่จะย้าย ${tenant.full_name || '-'} ออกจากห้อง ${tenant.room_number} หรือไม่?`;
    setMessage(moveOutMessage, '');
    moveOutModal.classList.replace('hidden', 'flex');
}

function closeMoveOutModal() {
    moveOutModal.classList.replace('flex', 'hidden');
    moveOutTenant = null;
}

async function confirmMoveOut() {
    if (!moveOutTenant) return;

    setMessage(moveOutMessage, '');

    if (!moveOutTenant.user_id) {
        setMessage(moveOutMessage, 'ผู้ใช้รายนี้ยังไม่มีบัญชีในระบบ');
        return;
    }

    const { error } = await supabase
        .from('tenant')
        .update({ room_number: null })
        .eq('user_id', moveOutTenant.user_id);

    if (error) {
        setMessage(moveOutMessage, friendlyError(error));
        return;
    }

    closeMoveOutModal();
    await refresh();
}

document.getElementById('confirmMoveInBtn').addEventListener('click', confirmMoveIn);
document.getElementById('cancelMoveInBtn').addEventListener('click', closeMoveInModal);
document.getElementById('confirmMoveOutBtn').addEventListener('click', confirmMoveOut);
document.getElementById('cancelMoveOutBtn').addEventListener('click', closeMoveOutModal);

document.getElementById('moveInRoomNum').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') confirmMoveIn();
});

moveInModal.addEventListener('click', (event) => {
    if (event.target === moveInModal) closeMoveInModal();
});

moveOutModal.addEventListener('click', (event) => {
    if (event.target === moveOutModal) closeMoveOutModal();
});

tbody.addEventListener('click', (event) => {
    const moveInBtn = event.target.closest('.btn-move-in');
    if (moveInBtn) {
        const tenant = tenants[parseInt(moveInBtn.getAttribute('data-idx'), 10)];
        if (tenant) openMoveInModal(tenant);
        return;
    }

    const moveOutBtn = event.target.closest('.btn-move-out');
    if (moveOutBtn) {
        const tenant = tenants[parseInt(moveOutBtn.getAttribute('data-idx'), 10)];
        if (tenant) openMoveOutModal(tenant);
    }
});

searchInput?.addEventListener('keyup', filterTable);

document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        roomFilter = btn.dataset.filter;
        applyRoomFilter();
        renderTable();
    });
});

// ลบข้อมูลจำลองออกจาก localStorage
localStorage.removeItem('users');
localStorage.removeItem('dormRoomsData');

async function init() {
    const allowed = await requireRole('admin');
    if (!allowed) return;

    applyRoomFilter();

    try {
        await refresh();
    } catch (error) {
        tbody.innerHTML = `<tr class="border-b border-gray-50"><td colspan="6" class="py-10 text-red-500">${escapeHtml(error.message)}</td></tr>`;
    }
}

init();