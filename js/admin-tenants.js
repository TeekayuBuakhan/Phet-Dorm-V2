// หน้าจัดการผู้เช่าของผู้ดูแล (Admin/Admin_Tenant.html)
//
// รายชื่อผู้เช่ามาจากตาราง tenant (ซึ่งสร้างอัตโนมัติตอนสมัครสมาชิก)
// การ "ย้ายเข้า/ย้ายออก" คือการใส่หรือล้างค่า room_number ของผู้เช่า

import { supabase } from '../Client.js';
import { friendlyError, requireRole } from './auth.js';
import { escapeHtml } from './ui.js';

const tbody = document.getElementById('tenantBody');
const searchInput = document.getElementById('searchInput');
const moveInModal = document.getElementById('moveInModal');
const moveOutModal = document.getElementById('moveOutModal');

let tenants = [];
let moveInTenant = null;
let moveOutTenant = null;

function normalize(value) {
    return String(value ?? '').trim().toLowerCase();
}

function formatPhone(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (digits.length !== 10) return phone || '-';
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

async function fetchTenants() {
    const { data, error } = await supabase
        .from('tenant')
        .select('tenant_id, full_name, phone_number, room_number, profiles(role)')
        .order('tenant_id');

    if (error) throw new Error(friendlyError(error));

    // บัญชีผู้ดูแลก็มีแถวในตาราง tenant จาก trigger แต่ไม่ใช่ผู้เช่า จึงไม่ต้องแสดง
    return (data ?? []).filter((tenant) => tenant.profiles?.role !== 'admin');
}

function renderTable() {
    tbody.innerHTML = '';

    const withRoom = tenants.filter((tenant) => tenant.room_number).length;
    document.getElementById('statTotal').innerText = tenants.length;
    document.getElementById('statWithRoom').innerText = withRoom;
    document.getElementById('statNoRoom').innerText = tenants.length - withRoom;

    if (tenants.length === 0) {
        tbody.innerHTML = '<tr class="border-b border-gray-50"><td colspan="5" class="py-10 text-gray-400">ยังไม่มีผู้เช่าในระบบ</td></tr>';
        return;
    }

    tenants.forEach((tenant, index) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50 hover:bg-gray-50/50 transition-colors';

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
            <td class="py-4 px-4 text-gray-400">${index + 1}</td>
            <td class="py-4 px-4 font-medium text-gray-800">${escapeHtml(tenant.full_name || '-')}</td>
            <td class="py-4 px-4">${escapeHtml(formatPhone(tenant.phone_number))}</td>
            <td class="py-4 px-4">${roomHtml}</td>
            <td class="py-4 px-4">${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    filterTable();
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
    moveInModal.classList.replace('hidden', 'flex');
}

function closeMoveInModal() {
    moveInModal.classList.replace('flex', 'hidden');
    moveInTenant = null;
}

async function confirmMoveIn() {
    if (!moveInTenant) return;

    const roomNumber = document.getElementById('moveInRoomNum').value.trim();
    if (!roomNumber) {
        alert('กรุณากรอกเลขห้อง');
        return;
    }

    const { data: room } = await supabase
        .from('room')
        .select('room_number, tenant(tenant_id)')
        .eq('room_number', roomNumber)
        .maybeSingle();

    if (!room) {
        alert('ไม่พบห้องนั้นในระบบ');
        return;
    }

    if (room.tenant?.length) {
        alert(`ห้อง ${room.room_number} มีผู้พักอาศัยอยู่แล้ว`);
        return;
    }

    const { error } = await supabase
        .from('tenant')
        .update({ room_number: roomNumber })
        .eq('tenant_id', moveInTenant.tenant_id);

    if (error) {
        alert(friendlyError(error));
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
    moveOutModal.classList.replace('hidden', 'flex');
}

function closeMoveOutModal() {
    moveOutModal.classList.replace('flex', 'hidden');
    moveOutTenant = null;
}

async function confirmMoveOut() {
    if (!moveOutTenant) return;

    const { error } = await supabase
        .from('tenant')
        .update({ room_number: null })
        .eq('tenant_id', moveOutTenant.tenant_id);

    if (error) {
        alert(friendlyError(error));
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

// ลบข้อมูลจำลองออกจาก localStorage
localStorage.removeItem('users');
localStorage.removeItem('dormRoomsData');

async function init() {
    const allowed = await requireRole('admin');
    if (!allowed) return;

    try {
        await refresh();
    } catch (error) {
        tbody.innerHTML = `<tr class="border-b border-gray-50"><td colspan="5" class="py-10 text-red-500">${escapeHtml(error.message)}</td></tr>`;
    }
}

init();