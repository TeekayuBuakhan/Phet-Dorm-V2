// บันทึกเลขมิเตอร์ไฟฟ้ารายห้องรายเดือน (meter_reading)
//
// หน้าบันทึกมิเตอร์เลือกเดือน/ปีแบบไทย (เช่น เมษายน / 2569) ส่วนฐานข้อมูลเก็บเป็นวันที่แบบ ISO
// จึงต้องแปลงชื่อเดือนไทยและปี พ.ศ. ให้เป็นคีย์เดือนก่อนใช้งาน

import { supabase } from '../Client.js';
import { friendlyError } from './auth.js';

export const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/**
 * แปลงชื่อเดือนไทย + ปี พ.ศ. เป็น 'YYYY-MM-01' (ปี ค.ศ.)
 * @param {string} monthName เช่น 'เมษายน'
 * @param {string|number} beYear เช่น '2569'
 */
export function toMonthKey(monthName, beYear) {
    const index = THAI_MONTHS.indexOf(String(monthName).trim());
    if (index === -1) throw new Error('ชื่อเดือนไม่ถูกต้อง');

    const year = Number(beYear);
    if (!Number.isInteger(year)) throw new Error('ปีไม่ถูกต้อง');

    const ceYear = year > 2400 ? year - 543 : year;
    return `${ceYear}-${String(index + 1).padStart(2, '0')}-01`;
}

/**
 * เดือนก่อนหน้าในรูปแบบเดียวกัน ใช้ดึงเลขมิเตอร์เดือนก่อน
 */
export function previousMonthKey(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 2, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    return `${THAI_MONTHS[month - 1]} ${String(year + 543).slice(-2)}`;
}

/**
 * เตรียมตัวเลือกเดือน/ปีแบบไทยให้ตรงกับปัจจุบัน
 * หน้าผู้ดูแลใช้ select ที่ซ่อนไว้คู่กับปุ่ม dropdown จึงต้องสร้าง option ของทั้งสองฝั่งให้ตรงกัน
 * ค่าเริ่มต้นคือเดือนปัจจุบันและปี พ.ศ. ปัจจุบัน
 */
export function initMonthYearSelectors() {
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    if (!monthSelect || !yearSelect) return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentBeYear = now.getFullYear() + 543;

    monthSelect.innerHTML = '';
    for (let offset = -1; offset <= 10; offset += 1) {
        const name = THAI_MONTHS[(currentMonth + offset + 12) % 12];
        const option = document.createElement('option');
        option.value = name;
        option.text = `เดือน ${name}`;
        monthSelect.appendChild(option);
    }

    const years = [];
    yearSelect.innerHTML = '';
    for (let year = currentBeYear - 1; year <= currentBeYear + 1; year += 1) {
        const option = document.createElement('option');
        option.value = String(year);
        option.text = String(year);
        yearSelect.appendChild(option);
        years.push(String(year));
    }

    monthSelect.value = THAI_MONTHS[currentMonth];
    yearSelect.value = String(currentBeYear);

    buildMenuOptions('monthMenu', 'month', THAI_MONTHS, (value) => `เดือน ${value}`);
    buildMenuOptions('yearMenu', 'year', years, (value) => value);

    if (typeof window.setSelValue === 'function') {
        window.setSelValue('month', monthSelect.value);
        window.setSelValue('year', yearSelect.value);
    }

    return { monthKey: toMonthKey(monthSelect.value, yearSelect.value) };
}

function buildMenuOptions(menuId, type, values, format) {
    const menu = document.getElementById(menuId);
    if (!menu) return;

    menu.innerHTML = values.map((value) => `
        <button type="button" data-value="${value}" onclick="setSelValue('${type}','${value}')" class="sel-option flex items-center w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-phet-orange/10 hover:text-phet-orange transition-colors text-left cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" class="sel-check h-4 w-4 mr-2 text-phet-orange hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
            ${format(value)}
        </button>`).join('');
}

/**
 * ห้องที่มีผู้เช่าอยู่ พร้อมข้อมูลห้องและค่าค่าไฟ/น้ำ
 */
export async function loadOccupiedRooms() {
    const { data: tenants, error } = await supabase
        .from('tenant')
        .select('room_number, full_name, phone_number')
        .not('room_number', 'is', null);

    if (error) throw new Error(friendlyError(error));

    const roomNumbers = [...new Set((tenants ?? []).map((row) => row.room_number).filter(Boolean))];
    if (roomNumbers.length === 0) return [];

    const { data: rooms, error: roomError } = await supabase
        .from('room')
        .select('room_number, room_price, elec_rate, water_rate')
        .in('room_number', roomNumbers);

    if (roomError) throw new Error(friendlyError(roomError));

    const roomMap = new Map((rooms ?? []).map((row) => [row.room_number, row]));

    return roomNumbers.map((roomNumber) => {
        const tenant = (tenants ?? []).find((row) => row.room_number === roomNumber);
        const room = roomMap.get(roomNumber) ?? {};
        return {
            roomNumber,
            tenantName: tenant?.full_name ?? '-',
            phoneNumber: tenant?.phone_number ?? '-',
            roomPrice: room.room_price ?? 0,
            elecRate: room.elec_rate ?? 8,
            waterRate: room.water_rate ?? 100,
        };
    }).sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
}

/**
 * เลขมิเตอร์ของทุกห้องในเดือนที่ระบุ
 * @param {string} monthKey 'YYYY-MM-01'
 * @returns {Promise<Map<string, number>>} map เลขห้อง -> เลขมิเตอร์
 */
export async function loadReadings(monthKey) {
    const { data, error } = await supabase
        .from('meter_reading')
        .select('room_number, meter_reading')
        .eq('reading_month', monthKey);

    if (error) throw new Error(friendlyError(error));

    return new Map((data ?? []).map((row) => [row.room_number, row.meter_reading]));
}

/**
 * บันทึกเลขมิเตอร์ของห้อง (upsert)
 */
export async function saveReading(roomNumber, monthKey, meterReading) {
    const value = Number(meterReading);
    if (!Number.isInteger(value) || value < 0) throw new Error('เลขมิเตอร์ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');

    const { error } = await supabase
        .from('meter_reading')
        .upsert(
            { room_number: roomNumber, reading_month: monthKey, meter_reading: value },
            { onConflict: 'room_number,reading_month' }
        );

    if (error) throw new Error(friendlyError(error));
}

/**
 * หน่วยที่ใช้ = เลขมิเตอร์เดือนนี้ - เดือนก่อน (ไม่ติดลบ)
 */
export function calculateUsage(current, previous) {
    if (current === null || previous === null) return 0;
    return Math.max(0, current - previous);
}