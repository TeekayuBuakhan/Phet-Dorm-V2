// หน้าจัดการห้องพักของผู้ดูแล (Admin/Admin_Room.html)
//
// ดึงข้อมูลห้องจากตาราง room พร้อมชื่อผู้เช่าและจำนวนบิลค้างชำระ
// รองรับการเพิ่มห้องและลบห้องผ่าน RLS ของผู้ดูแล

import { supabase } from '../Client.js';
import { friendlyError, requireRole } from './auth.js';
import { escapeHtml } from './ui.js';

const modal = document.getElementById('modalOverlay');
const deleteModal = document.getElementById('deleteModalOverlay');
const infoModal = document.getElementById('infoModalOverlay');
const tbody = document.getElementById('roomsBody');
const searchInput = document.getElementById('searchInput');

let rooms = [];
let rowToDeleteNum = null;
let currentRoomInfo = '';

async function fetchRooms() {
    const { data, error } = await supabase
        .from('room')
        .select('room_number, room_type, room_price, tenant(full_name, phone_number), billing(bill_id, bill_status)')
        .order('room_number');

    if (error) throw new Error(friendlyError(error));

    return data ?? [];
}

function vacantRowCount(bills) {
    if (!bills) return 0;
    return bills.filter((bill) => bill.bill_status === 'รอชำระ').length;
}

function renderTable() {
    tbody.innerHTML = '';

    if (rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-gray-400">ยังไม่มีข้อมูลห้อง</td></tr>';
        return;
    }

    rooms.forEach((room) => {
        const tenant = room.tenant?.[0] ?? null;
        const tenantName = tenant?.full_name || '-';
        const isOccupied = Boolean(tenant);
        const debt = vacantRowCount(room.billing);

        const statusHtml = isOccupied
            ? '<span class="inline-block bg-red-100 text-red-600 font-bold rounded-full px-3 py-1 text-xs border border-red-200">ไม่ว่าง</span>'
            : '<span class="inline-block bg-green-100 text-green-700 font-bold rounded-full px-3 py-1 text-xs border border-green-200">ว่าง</span>';

        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50 hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="py-4 px-4 font-bold text-gray-800">${escapeHtml(room.room_number)}</td>
            <td class="py-4 px-4">${statusHtml}</td>
            <td class="py-4 px-4 text-gray-700">${escapeHtml(room.room_type || '-')}</td>
            <td class="py-4 px-4 text-gray-700">${room.room_price ? Number(room.room_price).toLocaleString() : '-'}</td>
            <td class="py-4 px-4 text-gray-700">${escapeHtml(tenantName)}</td>
            <td class="py-4 px-4">
                <button class="btn-more text-gray-400 hover:text-phet-orange transition-colors flex justify-center w-full focus:outline-none" data-room="${escapeHtml(room.room_number)}" title="ดูข้อมูล">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 pointer-events-none">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                </button>
            </td>
            <td class="py-4 px-4">
                <button class="btn-delete text-gray-400 hover:text-red-500 transition-colors flex justify-center w-full focus:outline-none" data-room="${escapeHtml(room.room_number)}" title="ลบห้อง">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 pointer-events-none">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    filterTable();
}

function filterTable() {
    const keyword = (searchInput?.value ?? '').toUpperCase();

    [...tbody.rows].forEach((row) => {
        const firstCell = row.cells[0]?.textContent ?? '';
        row.style.display = !keyword || firstCell.toUpperCase().includes(keyword) ? '' : 'none';
    });
}

async function refresh() {
    rooms = await fetchRooms();
    renderTable();
}

function closeModal() {
    modal.classList.replace('flex', 'hidden');
    document.getElementById('newRoomNum').value = '';
    document.getElementById('newRoomPrice').value = '';
}

document.getElementById('openAddRoomBtn').addEventListener('click', () => {
    modal.classList.replace('hidden', 'flex');
});

document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

document.getElementById('saveModalBtn').addEventListener('click', async () => {
    const roomNumber = document.getElementById('newRoomNum').value.trim();
    const roomType = document.getElementById('newRoomType').value;
    const roomPrice = document.getElementById('newRoomPrice').value.trim();

    if (!roomNumber || !roomPrice) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    if (rooms.some((room) => room.room_number === roomNumber)) {
        alert('มีเลขห้องนี้อยู่ในระบบแล้วครับ');
        return;
    }

    const { error } = await supabase.from('room').insert({
        room_number: roomNumber,
        room_type: roomType,
        room_price: Number(roomPrice),
    });

    if (error) {
        alert(friendlyError(error));
        return;
    }

    await refresh();
    closeModal();
});

tbody.addEventListener('click', (event) => {
    const deleteBtn = event.target.closest('.btn-delete');
    if (deleteBtn) {
        rowToDeleteNum = deleteBtn.getAttribute('data-room');
        deleteModal.classList.replace('hidden', 'flex');
        return;
    }

    const moreBtn = event.target.closest('.btn-more');
    if (moreBtn) {
        const roomNumber = moreBtn.getAttribute('data-room');
        currentRoomInfo = roomNumber;

        const room = rooms.find((item) => item.room_number === roomNumber);
        const tenant = room?.tenant?.[0];

        document.getElementById('infoRoomNum').innerText = room?.room_number ?? '-';
        document.getElementById('infoTenantName').innerText = tenant?.full_name || '-';
        document.getElementById('infoPhone').innerText = tenant?.phone_number || '-';

        const debtBadge = document.getElementById('infoDebtBadge');
        const debt = vacantRowCount(room?.billing);
        debtBadge.innerText = `ค้างชำระ ${debt} บิล`;

        if (debt > 0) debtBadge.classList.replace('hidden', 'inline-block');
        else debtBadge.classList.replace('inline-block', 'hidden');

        infoModal.classList.replace('hidden', 'flex');
    }
});

document.getElementById('closeDeleteBtn').addEventListener('click', () => {
    deleteModal.classList.replace('flex', 'hidden');
    rowToDeleteNum = null;
});

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!rowToDeleteNum) return;

    const { error } = await supabase
        .from('room')
        .delete()
        .eq('room_number', rowToDeleteNum);

    if (error) {
        alert(`ลบห้องไม่สำเร็จ: ${friendlyError(error)}`);
    } else {
        await refresh();
    }

    rowToDeleteNum = null;
    deleteModal.classList.replace('flex', 'hidden');
});

document.getElementById('closeInfoBtn').addEventListener('click', () => {
    infoModal.classList.replace('flex', 'hidden');
});

document.getElementById('editDataBtn').addEventListener('click', () => {
    window.location.href = `Admin_editRoom.html?room=${encodeURIComponent(currentRoomInfo)}`;
});

searchInput?.addEventListener('keyup', filterTable);

// ลบข้อมูลจำลองออกจาก localStorage เพราะเปลี่ยนไปใช้ฐานข้อมูลแล้ว
localStorage.removeItem('dormRoomsData');

async function init() {
    const allowed = await requireRole('admin');
    if (!allowed) return;

    try {
        await refresh();
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-red-500">${escapeHtml(error.message)}</td></tr>`;
    }
}

init();