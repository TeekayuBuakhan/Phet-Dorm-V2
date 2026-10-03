// หน้าบันทึกเลขมิเตอร์ไฟฟ้า (Admin/Admin_Meter.html)
//
// ข้อมูลเดิมเก็บใน localStorage ทำให้หายเมื่อเปลี่ยนเครื่อง จึงย้ายไปตาราง meter_reading
// หน่วยที่ใช้คำนวณจากเลขมิเตอร์เดือนนี้ลบเดือนก่อน แล้วคิดเงินด้วยค่าไฟฟ้าของห้อง

import { requireRole } from './auth.js';
import {
    toMonthKey,
    previousMonthKey,
    initMonthYearSelectors,
    loadOccupiedRooms,
    loadReadings,
    saveReading,
    calculateUsage,
} from './meters.js';

const tableBody = document.getElementById('meter-body');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');
const searchInput = document.getElementById('meter-search');

let rooms = [];
let currentReadings = new Map();
let previousReadings = new Map();
let monthKey = '';
let searchKeyword = '';


function elecCostOf(room, usage) {
    return usage * room.elecRate;
}

function updateRowCalculation(tr, room) {
    const input = tr.querySelector('.meter-input');
    const current = input.value === '' ? null : Number(input.value);
    const previous = previousReadings.has(room.roomNumber) ? previousReadings.get(room.roomNumber) : null;
    const usage = calculateUsage(current, previous);

    tr.querySelector('[data-role="usage"]').textContent = usage;
    tr.querySelector('[data-role="cost"]').textContent = elecCostOf(room, usage).toLocaleString();
}

function renderTable() {
    if (rooms.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="py-10 text-center text-gray-400">ยังไม่มีห้องที่มีผู้เช่า</td></tr>';
        return;
    }

    const keyword = searchKeyword.trim().toUpperCase();
    const visible = rooms.filter((room) => keyword === '' || room.roomNumber.toUpperCase().includes(keyword));

    if (visible.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="py-10 text-center text-gray-400">ไม่พบเลขห้องที่ค้นหา</td></tr>';
        return;
    }

    tableBody.innerHTML = visible.map((room) => {
        const previous = previousReadings.get(room.roomNumber);
        const current = currentReadings.get(room.roomNumber);
        const usage = calculateUsage(current ?? null, previous ?? null);

        return `
            <tr class="border-b border-gray-50 hover:bg-orange-50/30 transition-colors" data-room="${room.roomNumber}">
                <td class="py-4 px-6 font-medium">${room.roomNumber}</td>
                <td class="py-4 px-6">${previous ?? 0}</td>
                <td class="py-4 px-6">
                    <input type="text" class="meter-input w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:border-phet-orange focus:ring-phet-orange outline-none" value="${current ?? ''}" maxlength="6" inputmode="numeric" placeholder="____">
                </td>
                <td class="py-4 px-6 text-gray-400" data-role="usage">${usage}</td>
                <td class="py-4 px-6 text-red-500 font-medium" data-role="cost">${elecCostOf(room, usage).toLocaleString()}</td>
                <td class="py-4 px-6 pr-8 text-right">
                    <button class="bg-btn-green text-white px-6 py-1.5 rounded-lg text-sm font-medium hover:bg-green-600 transition shadow-sm">บันทึก</button>
                </td>
            </tr>`;
    }).join('');

    tableBody.querySelectorAll('tr[data-room]').forEach((tr) => {
        const room = rooms.find((item) => item.roomNumber === tr.dataset.room);
        if (!room) return;

        const input = tr.querySelector('.meter-input');
        input.addEventListener('input', () => {
            input.value = input.value.replace(/[^0-9]/g, '').slice(0, 6);
            updateRowCalculation(tr, room);
        });

        tr.querySelector('button').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            const original = button.textContent;
            button.textContent = 'กำลังบันทึก...';

            try {
                await saveReading(room.roomNumber, monthKey, input.value === '' ? 0 : input.value);
                currentReadings.set(room.roomNumber, input.value === '' ? 0 : Number(input.value));
                updateRowCalculation(tr, room);
                button.textContent = 'บันทึกแล้ว';
                setTimeout(() => { button.textContent = original; }, 1500);
            } catch (error) {
                alert(`บันทึกไม่สำเร็จ: ${error.message}`);
                button.textContent = original;
            } finally {
                button.disabled = false;
            }
        });
    });
}

async function loadTable() {
    tableBody.innerHTML = '<tr><td colspan="6" class="py-10 text-center text-gray-400">กำลังโหลดข้อมูล...</td></tr>';

    try {
        monthKey = toMonthKey(monthSelect.value, yearSelect.value);
        rooms = await loadOccupiedRooms();

        const [current, previous] = await Promise.all([
            loadReadings(monthKey),
            loadReadings(previousMonthKey(monthKey)),
        ]);

        currentReadings = current;
        previousReadings = previous;
        renderTable();
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-red-500">โหลดข้อมูลไม่สำเร็จ: ${error.message}</td></tr>`;
    }
}

async function init() {
    const allowed = await requireRole('admin');
    if (!allowed) return;

    initMonthYearSelectors();
    await loadTable();

    document.getElementById('meter-apply-btn').addEventListener('click', loadTable);

    document.getElementById('meter-search-btn').addEventListener('click', () => {
        searchKeyword = searchInput.value;
        renderTable();
    });

    searchInput.addEventListener('keyup', (event) => {
        if (event.key !== 'Enter') return;
        searchKeyword = searchInput.value;
        renderTable();
    });
}

localStorage.removeItem('dormRoomsData');

init();
