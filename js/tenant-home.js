// หน้าหลังของผู้เช่า (Tenant/Main_Tenant.html)
//
// ดึงห้องพักและยอดค้างชำระจากฐานข้อมูล โดยอิงจาก user_id ของบัญชีที่ล็อกอิน
// ถ้ายังไม่มีการจัดสรรห้อง จะขึ้นว่า "ยังไม่มีห้องพัก"

import { supabase } from '../Client.js';
import { friendlyError, getMyProfile, requireRole } from './auth.js';

const roomLabel = document.getElementById('display-room');
const nameLabel = document.getElementById('display-name');
const balanceLabel = document.getElementById('balance-amount');

async function getMyTenantRow() {
    const { data, error } = await supabase
        .from('tenant')
        .select('tenant_id, room_number, full_name')
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(friendlyError(error));

    return data;
}

async function getOutstandingBalance(roomNumber) {
    const { data, error } = await supabase
        .from('billing')
        .select('total_amount')
        .eq('room_number', roomNumber)
        .eq('bill_status', 'รอชำระ');

    if (error) throw new Error(friendlyError(error));

    return (data ?? []).reduce((sum, bill) => sum + Number(bill.total_amount ?? 0), 0);
}

function showNoRoom(profile) {
    roomLabel.innerText = 'ยังไม่มีห้องพัก';
    nameLabel.innerText = profile?.full_name ?? '-';
    balanceLabel.innerText = '0';
}

async function renderHome() {
    // แสดงชื่อจากโปรไฟล์ก่อน เผื่อยังไม่มีแถวใน tenant
    const profile = await getMyProfile();
    nameLabel.innerText = profile?.full_name ?? '-';
    balanceLabel.innerText = '0';

    const tenantRow = await getMyTenantRow();
    if (!tenantRow?.room_number) {
        showNoRoom(profile);
        return;
    }

    const { data: room, error } = await supabase
        .from('room')
        .select('room_number, room_type, room_price')
        .eq('room_number', tenantRow.room_number)
        .maybeSingle();

    if (error) throw new Error(friendlyError(error));

    roomLabel.innerText = room?.room_number ?? tenantRow.room_number;

    const outstanding = await getOutstandingBalance(tenantRow.room_number);
    balanceLabel.innerText = outstanding.toLocaleString();

    // หน้าเว็บเป็น classic script จึงเรียกฟังก์ชันปรับปุ่มชำระเงินผ่าน global
    if (typeof window.checkBalance === 'function') window.checkBalance();
}

async function init() {
    const allowed = await requireRole('tenant');
    if (!allowed) return;

    try {
        await renderHome();
    } catch (error) {
        console.error(error);
        balanceLabel.innerText = '0';
    }
}

localStorage.removeItem('dormRoomsData');

init();