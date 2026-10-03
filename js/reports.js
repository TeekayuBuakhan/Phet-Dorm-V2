// จัดการคำร้องแจ้งเรื่อง (report) ใช้ร่วมกันระหว่างหน้าผู้เช่าและผู้ดูแล
//
// ตาราง report เก็บเลขห้องไว้ ทำให้ผู้เช่าที่รับเรื่องเห็นเฉพาะคำร้องของห้องตัวเอง
// รูปภาพเก็บใน bucket report-images โดยแยกโฟลเดอร์ตามเลขห้อง
// ในคอลัมน์ images เก็บ path คั่นด้วย comma

import { supabase } from '../Client.js';
import { friendlyError } from './auth.js';

const BUCKET = 'report-images';
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const STATUS_PENDING = 'ยังไม่ได้รับเรื่อง';
export const STATUS_ACCEPTED = 'รับเรื่องแล้ว';
export const STATUS_DONE = 'เสร็จสิ้น';

function toThaiDate(value) {
    const date = new Date(value);
    const day = date.getDate();
    const month = THAI_MONTHS[date.getMonth()];
    const year = String(date.getFullYear() + 543).slice(-2);
    return `${day} ${month} ${year}`;
}

function toImageUrls(images) {
    if (!images) return [];
    const paths = String(images).split(',').map((path) => path.trim()).filter(Boolean);
    return paths.map((path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
}

/**
 * แปลงแถวจากฐานข้อมูลเป็นรูปแบบที่หน้าเว็บใช้
 * id เป็น string เพราะ report_id เป็น varchar
 */
function toReportItem(row) {
    return {
        id: row.report_id,
        date: toThaiDate(row.report_date ?? new Date()),
        type: row.issue_type,
        detail: row.issue_detail,
        status: row.report_status,
        roomNumber: row.room_number,
        images: toImageUrls(row.images),
    };
}

/**
 * @param {string|null} roomNumber ถ้าระบุ จะดูเฉพาะห้องนั้น (ผู้เช่าดูของตัวเอง)
 */
export async function loadReports(roomNumber = null) {
    let query = supabase
        .from('report')
        .select('report_id, report_date, issue_type, issue_detail, report_status, room_number, images')
        .order('report_date', { ascending: false })
        .order('report_id', { ascending: false });

    if (roomNumber) query = query.eq('room_number', roomNumber);

    const { data, error } = await query;
    if (error) throw new Error(friendlyError(error));

    return (data ?? []).map(toReportItem);
}

async function uploadImages(roomNumber, files) {
    const paths = [];

    for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${roomNumber}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
            cacheControl: '3600',
            upsert: false,
        });
        if (error) throw new Error(friendlyError(error));
        paths.push(path);
    }

    return paths;
}

/**
 * สร้างคำร้องใหม่ พร้อมอัปโหลดรูปที่แนบ
 * @param {{ roomNumber: string, type: string, detail: string, files: File[] }} payload
 */
export async function createReport({ roomNumber, type, detail, files }) {
    if (!roomNumber) throw new Error('ยังไม่มีข้อมูลห้องพัก กรุณาติดต่อผู้ดูแล');

    const paths = files?.length ? await uploadImages(roomNumber, files) : [];

    const { data, error } = await supabase
        .from('report')
        .insert({
            issue_type: type,
            issue_detail: detail,
            report_status: STATUS_PENDING,
            room_number: roomNumber,
            images: paths.length ? paths.join(',') : null,
        })
        .select('report_id')
        .single();

    if (error) throw new Error(friendlyError(error));

    return data.report_id;
}

export async function deleteReport(reportId) {
    const { error } = await supabase.from('report').delete().eq('report_id', reportId);
    if (error) throw new Error(friendlyError(error));
}

export async function updateReportStatus(reportId, status) {
    const { error } = await supabase
        .from('report')
        .update({ report_status: status })
        .eq('report_id', reportId);

    if (error) throw new Error(friendlyError(error));
}

export { toThaiDate };