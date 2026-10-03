// รหัส OTP สำหรับตอนที่ยังตั้งค่าอีเมลจริงไม่ได้
//
// ปกติระบบจะให้ Supabase ส่งรหัส 6 หลักไปทางอีเมล แต่ถ้ายังไม่ได้แก้ Email Template
// ใน Supabase Dashboard รหัสจะไม่มีรูปแบบที่กรอกได้ ฟังก์ชันในไฟล์นี้จึงสุ่มรหัสขึ้นมาเอง
// แล้วแสดงผ่าน alert พร้อมกับบันทึกไว้ใน sessionStorage เพื่อให้หน้าถัดไปตรวจสอบได้
//
// !! โหมดนี้ไม่มีความปลอดภัย ห้ามใช้ตอนขึ้นใช้งานจริง !!
// ปิดโหมดนี้ได้โดยแก้ DEV_OTP_MODE ใน config.js เป็น false

import { DEV_OTP_MODE } from '../config.js';
import { supabase } from '../Client.js';
import { requestPasswordReset, verifyEmailOtp } from './auth.js';

const STORAGE_KEY = 'devOtpCode';
const TTL_MINUTES = 5;

// เก็บสิทธิ์ตั้งรหัสผ่านใหม่ไว้ชั่วคราวหลังยืนยัน OTP สำเร็จ
// (โหมดจำลองไม่มี recovery session จาก Supabase จึงต้องใช้ flag ฝั่งเบราว์เซอร์แทน)
const GRANT_KEY = 'devPasswordResetGrant';
const GRANT_MINUTES = 15;

function readJson(key) {
    try {
        return JSON.parse(sessionStorage.getItem(key) ?? 'null');
    } catch (error) {
        console.error(error);
        return null;
    }
}

function randomCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

export function isDevOtpMode() {
    return DEV_OTP_MODE;
}

/**
 * สุ่มรหัส 6 หลัก แล้วแสดงให้ผู้ใช้ผ่าน alert
 * @param {string} email อีเมลเจ้าของรหัส
 * @param {string} purpose วัตถุประสงค์ 'recovery' | 'phone'
 * @returns {string} รหัสที่สุ่มได้
 */
export function issueOtp(email, purpose) {
    const code = randomCode();

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        email,
        purpose,
        code,
        expiresAt: Date.now() + TTL_MINUTES * 60 * 1000,
    }));

    alert(`โหมดทดลอง: ระบบยังไม่ได้ส่งอีเมลจริง\n\n`
        + `รหัส OTP ของ ${email} คือ ${code}\n`
        + `รหัสนี้ใช้ได้ภายใน ${TTL_MINUTES} นาที`);

    return code;
}

/**
 * ตรวจรหัสที่สุ่มไว้ในเบราว์เซอร์
 * @returns {boolean}
 */
export function verifyLocalOtp(code, purpose, email) {
    const record = readJson(STORAGE_KEY);
    if (!record) return false;
    if (record.code !== String(code).trim()) return false;
    if (record.purpose !== purpose) return false;
    if (email && record.email !== email) return false;
    if (Date.now() > record.expiresAt) return false;

    sessionStorage.removeItem(STORAGE_KEY);
    return true;
}

export function clearOtp() {
    sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * ขอรหัส OTP แบบเดียวกันทั้งสองโหมด
 * @param {string} email
 * @param {string} purpose 'recovery' | 'phone'
 * @returns {Promise<void>}
 */
export async function requestOtp(email, purpose = 'recovery') {
    if (DEV_OTP_MODE) {
        issueOtp(email, purpose);
        return;
    }

    if (purpose === 'recovery') {
        await requestPasswordReset(email);
        return;
    }

    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
    });

    if (error) throw new Error(error.message);
}

/**
 * ตรวจรหัส OTP แล้วคืนสถานะว่าตั้งรหัสผ่านใหม่ได้หรือไม่
 * @param {{email: string, code: string, purpose?: string, type?: string}} options
 * @returns {Promise<boolean>}
 */
export async function confirmOtp({ email, code, purpose = 'recovery', type = 'recovery' }) {
    if (DEV_OTP_MODE) {
        const valid = verifyLocalOtp(code, purpose, email);
        if (valid && purpose === 'recovery') grantPasswordReset(email);
        return valid;
    }

    await verifyEmailOtp(email, code, type);
    return true;
}

/** บันทึกสิทธิ์ตั้งรหัสผ่านใหม่ (ใช้เฉพาะโหมดจำลอง) */
export function grantPasswordReset(email) {
    sessionStorage.setItem(GRANT_KEY, JSON.stringify({
        email,
        expiresAt: Date.now() + GRANT_MINUTES * 60 * 1000,
    }));
}

/** อ่านสิทธิ์ตั้งรหัสผ่านใหม่ คืน null ถ้าหมดอายุหรือไม่มี */
export function readPasswordResetGrant() {
    const record = readJson(GRANT_KEY);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
        sessionStorage.removeItem(GRANT_KEY);
        return null;
    }
    return record;
}

export function clearPasswordResetGrant() {
    sessionStorage.removeItem(GRANT_KEY);
}