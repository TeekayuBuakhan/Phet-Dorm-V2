// จัดการบิลค่าเช่า (billing) ใช้ร่วมกันระหว่างหน้าผู้เช่าและผู้ดูแล
//
// สถานะบิลที่หน้าเว็บใช้ทั้งหมด
//   STATUS_PENDING   = 'รอชำระเงิน'            ยังไม่ได้ส่งสลิป
//   STATUS_SUBMITTED = 'รออนุมัติการชำระเงิน'  ส่งสลิปแล้ว รอผู้ดูแลตรวจ
//   STATUS_PAID      = 'ชำระเงินแล้ว'           ผู้ดูแลยืนยันแล้ว
//
// สลิปเก็บใน bucket bill-slips แยกโฟลเดอร์ตามเลขห้อง คอลัมน์ slip_image เก็บ path

import { supabase } from '../Client.js';
import { friendlyError } from './auth.js';

const BUCKET = 'bill-slips';

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export const STATUS_PENDING = 'รอชำระเงิน';
export const STATUS_SUBMITTED = 'รออนุมัติการชำระเงิน';
export const STATUS_PAID = 'ชำระเงินแล้ว';

export const PAY_METHODS = ['ธนาคาร', 'เงินสด'];

const BILL_COLUMNS = 'bill_id, bill_date, room_cost, elec_unit, elec_cost, water_cost, total_amount, bill_status, pay_method, slip_image, room_number';

function formatMonthYear(value) {
    const date = new Date(value);
    return `${THAI_MONTHS[date.getMonth()]} ${String(date.getFullYear() + 543).slice(-2)}`;
}

function slipUrl(path) {
    if (!path) return null;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * แปลงแถวบิลเป็นรูปแบบที่หน้าเว็บใช้
 */
export function toBillItem(row) {
    return {
        billId: row.bill_id,
        monthYear: formatMonthYear(row.bill_date),
        monthYearShort: String(row.bill_date).slice(0, 7),
        roomNumber: row.room_number,
        roomCost: row.room_cost ?? 0,
        elecUnit: row.elec_unit ?? 0,
        elecCost: row.elec_cost ?? 0,
        waterCost: row.water_cost ?? 0,
        total: row.total_amount ?? 0,
        status: row.bill_status ?? STATUS_PENDING,
        payMethod: row.pay_method ?? null,
        slipImage: slipUrl(row.slip_image),
    };
}

/**
 * @param {string|null} roomNumber ถ้าระบุ จะดูเฉพาะบิลห้องนั้น
 */
export async function loadBills(roomNumber = null) {
    let query = supabase
        .from('billing')
        .select(BILL_COLUMNS)
        .order('bill_date', { ascending: false })
        .order('bill_id', { ascending: false });

    if (roomNumber) query = query.eq('room_number', roomNumber);

    const { data, error } = await query;
    if (error) throw new Error(friendlyError(error));

    return (data ?? []).map(toBillItem);
}

async function uploadSlip(roomNumber, file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${roomNumber}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
    });
    if (error) throw new Error(friendlyError(error));

    return path;
}

/**
 * ผู้เช่าส่งสลิป (หรือแจ้งว่าจ่ายเงินสด) ของบิลที่ยังไม่ได้ชำระ
 * @param {string} billId
 * @param {{ method: string, file?: File|null }} payload
 */
export async function submitPayment(billId, { method, file = null }) {
    if (!PAY_METHODS.includes(method)) {
        throw new Error('กรุณาเลือกช่องทางชำระเงิน');
    }

    let slipPath = null;
    if (method === 'ธนาคาร') {
        if (!file) throw new Error('กรุณาแนบหลักฐานการโอน');
        const { data: bill } = await supabase
            .from('billing')
            .select('room_number')
            .eq('bill_id', billId)
            .maybeSingle();

        if (!bill?.room_number) throw new Error('ไม่พบข้อมูลห้องของบิลนี้');
        slipPath = await uploadSlip(bill.room_number, file);
    }

    const { data, error } = await supabase
        .from('billing')
        .update({
            bill_status: STATUS_SUBMITTED,
            pay_method: method,
            slip_image: slipPath,
        })
        .eq('bill_id', billId)
        .eq('bill_status', STATUS_PENDING)
        .select('bill_id');

    if (error) throw new Error(friendlyError(error));
    if (!data?.length) throw new Error('บิลนี้ถูกชำระหรือยกเลิกไปแล้ว กรุณาลองใหม่');
}

/**
 * ผู้ดูแลยืนยันว่าตรวจสลิปแล้ว
 * อนุมัติได้เฉพาะบิลที่ผู้เช่าส่งสลิปหรือแจ้งชำระเงินสดมาแล้วเท่านั้น
 */
export async function approvePayment(billId) {
    const { data, error } = await supabase
        .from('billing')
        .update({ bill_status: STATUS_PAID })
        .eq('bill_id', billId)
        .eq('bill_status', STATUS_SUBMITTED)
        .select('bill_id');

    if (error) throw new Error(friendlyError(error));
    if (!data?.length) throw new Error('บิลนี้ยังไม่ได้รับการชำระเงิน จึงยังอนุมัติไม่ได้');
}

/**
 * ผู้ดูแลส่งบิลกลับให้ผู้เช่าส่งสลิปใหม่
 */
export async function rejectPayment(billId) {
    const { data, error } = await supabase
        .from('billing')
        .update({ bill_status: STATUS_PENDING, pay_method: null, slip_image: null })
        .eq('bill_id', billId)
        .eq('bill_status', STATUS_SUBMITTED)
        .select('bill_id');

    if (error) throw new Error(friendlyError(error));
    if (!data?.length) throw new Error('บิลนี้ไม่อยู่ในสถานะรออนุมัติ');
}

/**
 * ผู้ดูแลสร้างบิลใหม่
 * @param {{ roomNumber: string, billDate: string, roomCost: number, elecUnit: number, elecRate: number, waterCost: number }} payload
 */
export async function createBill({ roomNumber, billDate, roomCost, elecUnit, elecRate, waterCost }) {
    const elecCost = Math.round(Number(elecUnit) * Number(elecRate));
    const total = Number(roomCost) + elecCost + Number(waterCost);

    const { data, error } = await supabase
        .from('billing')
        .insert({
            bill_date: billDate,
            room_number: roomNumber,
            room_cost: Number(roomCost),
            elec_unit: Number(elecUnit),
            elec_cost: elecCost,
            water_cost: Number(waterCost),
            total_amount: total,
            bill_status: STATUS_PENDING,
        })
        .select('bill_id')
        .single();

    if (error) throw new Error(friendlyError(error));
    return data.bill_id;
}

/**
 * ผู้ดูแลยกเลิกบิลที่ยังไม่มีผู้เช่าชำระ
 */
export async function deleteBill(billId) {
    const { data, error } = await supabase
        .from('billing')
        .delete()
        .eq('bill_id', billId)
        .eq('bill_status', STATUS_PENDING)
        .select('bill_id');

    if (error) throw new Error(friendlyError(error));
    if (!data?.length) throw new Error('ยกเลิกบิลไม่ได้ เพราะผู้เช่าชำระเงินไปแล้ว');
}

/**
 * อัปเดตยอดค้างชำระของห้อง
 */
export async function getOutstandingBalance(roomNumber) {
    const { data, error } = await supabase
        .from('billing')
        .select('total_amount, bill_status')
        .eq('room_number', roomNumber)
        .neq('bill_status', STATUS_PAID);

    if (error) throw new Error(friendlyError(error));

    return (data ?? []).reduce((sum, row) => sum + (row.total_amount ?? 0), 0);
}