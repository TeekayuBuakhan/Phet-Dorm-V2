// โมดูลกลางของระบบล็อกอิน ใช้ร่วมกันทุกหน้า
//
// ตัวตนของผู้ใช้คือ "อีเมล" (Supabase Auth ไม่มีช่อง username)
// เบอร์โมือถือเก็บใน profiles.phone_number และบังคับตอนสมัคร
//
// ทุกฟังก์ชันที่เรียก supabase จะโยน Error ที่อ่านเข้าใจได้แล้ว
// เพื่อให้หน้าเว็บเอาไปแสดงผลได้ตรงๆ

import { supabase } from '../Client.js';
import { DEV_OTP_MODE } from '../config.js';

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_REGEX = /^0\d{9}$/;
export const PASSWORD_MIN_LENGTH = 6;
export const OTP_LENGTH = 6;

// ---------- ตรวจความถูกต้องของข้อมูล ----------

export function validateEmail(email) {
    return EMAIL_REGEX.test(String(email ?? '').trim());
}

export function validatePhone(phone) {
    return PHONE_REGEX.test(String(phone ?? '').trim());
}

export function validatePassword(password) {
    return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH;
}

// ---------- แปลง error ให้เป็นข้อความภาษาไทย ----------

export function friendlyError(error) {
    const message = error?.message ?? '';

    if (/rate limit|too many requests|security purposes/i.test(message)) {
        return 'ขอให้รอสักครู่แล้วลองใหม่อีกครั้ง';
    }
    if (/already registered|already been registered|duplicate key/i.test(message)) {
        return 'อีเมลนี้มีบัญชีอยู่แล้ว';
    }
    if (/invalid login credentials/i.test(message)) {
        return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    }
    if (/email not confirmed/i.test(message)) {
        return 'กรุณายืนยันอีเมลก่อนใช้งาน';
    }
    if (/phone_number is required/i.test(message)) {
        return 'กรุณากรอกเบอร์โมือถือ 10 หลัว';
    }
    if (/profiles_phone_number_key|profiles_email_key|duplicate key/i.test(message)) {
        return 'เบอร์โมือถือนี้ถูกใช้สมัครไว้แล้ว';
    }
    if (/row-level security|not authorized/i.test(message)) {
        return 'คุณไม่มีสิทธิ์ทำรายการนี้';
    }
    if (/Password should be/i.test(message)) {
        return `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`;
    }

    return message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

// ---------- การสมัครสมาชิก / เข้าสู่ระบบ ----------

/**
 * สมัครสมาชิกใหม่
 *
 * ตอน DEV_OTP_MODE = true จะไม่ส่งอีเมลยืนยัน แต่เรียก RPC dev_signup ที่สร้างบัญชีให้ยืนยันแล้วเสร็จ
 * แล้วล็อกอินให้ทันที ต้องปิดโหมดนี้ก่อนใช้งานจริง
 *
 * @returns {Promise<{ session: object|null, user: object|null }>}
 *   session เป็น null ถ้ายังไม่ได้ยืนยันอีเมล (ต้องไปกดลิงก์ในอีเมลก่อน)
 */
export async function signUp({ fullName, email, phone, password }) {
    if (DEV_OTP_MODE) return devSignUp({ fullName, email, phone, password });

    const { data, error } = await supabase.auth.signUp({
        email: String(email).trim(),
        password,
        options: {
            data: {
                full_name: String(fullName).trim(),
                phone_number: String(phone).trim(),
            },
            emailRedirectTo: `${window.location.origin}/index.html`,
        },
    });

    if (error) {
        // ถ้า trigger ฝั่งฐานข้อมูลสั่งไม่ให้สมัคร จะได้ 500 โดยไม่มีข้อความมาด้วย
        // ซึ่งแปลว่าเบอร์โทรศัพท์ไม่ผ่านเงื่อนไขที่ฐานข้อมูลบังคับ
        if (!error.message && error.status === 500) {
            throw new Error('กรุณากรอกเบอร์โทรศัพท์ 10 หลัวขึ้นต้นด้วย 0');
        }

        throw new Error(friendlyError(error));
    }

    return data;
}

// สมัครสมาชิกแบบไม่ต้องยืนยันอีเมล ใช้เฉพาะตอน DEV_OTP_MODE = true
async function devSignUp({ fullName, email, phone, password }) {
    const cleanEmail = String(email).trim();
    const cleanName = String(fullName).trim();
    const cleanPhone = String(phone).trim();

    const { data: userId, error: signUpError } = await supabase.rpc('dev_signup', {
        p_email: cleanEmail,
        p_password: password,
        p_full_name: cleanName,
        p_phone: cleanPhone,
    });

    if (signUpError) throw new Error(friendlyError(signUpError));

    // คืนค่า null เมื่อมีอีเมลนี้อยู่แล้ว
    if (!userId) throw new Error('อีเมลนี้มีบัญชีอยู่แล้ว');

    const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
    });

    if (error) throw new Error(friendlyError(error));

    return data;
}

export async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email).trim(),
        password,
    });

    if (error) throw new Error(friendlyError(error));

    return data;
}

export async function signOut(base = '../') {
    await supabase.auth.signOut();
    window.location.href = `${base}index.html`;
}

// ---------- ลืมรหัสผ่าน ----------

/**
 * ขอ OTP 6 หลัวทางอีเมล (ต้องแก้ Email Template แบบ Reset Password ให้แสดง {{ .Token }} ด้วย)
 */
export async function requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim(), {
        redirectTo: `${window.location.origin}/Login/ResetPassword.html`,
    });

    if (error) throw new Error(friendlyError(error));
}

/**
 * ตรวจ OTP จากอีเมล
 * @param {'recovery'|'email'|'signup'} type
 * หลัง verify สำเร็จจะมี session ชั่วคราวไว้ตั้งรหัสผ่านใหม่
 */
export async function verifyEmailOtp(email, token, type = 'recovery') {
    const { data, error } = await supabase.auth.verifyOtp({
        email: String(email).trim(),
        token: String(token).trim(),
        type,
    });

    if (error) throw new Error(friendlyError(error));

    return data;
}

export async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) throw new Error(friendlyError(error));
}

// ---------- อ่านข้อมูลผู้ใช้ ----------

export async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(friendlyError(error));
    return data.session;
}

export async function getMyProfile() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(friendlyError(error));
    if (!data.user) return null;

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone_number, role')
        .eq('id', data.user.id)
        .maybeSingle();

    if (profileError) throw new Error(friendlyError(profileError));

    return profile;
}

export async function updateMyProfile(patch) {
    const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .select('id, email, full_name, phone_number, role')
        .maybeSingle();

    if (error) throw new Error(friendlyError(error));

    return data;
}

// ---------- การควบคุมการเข้าหน้า ----------

/**
 * หน้าหลังของแต่ละ role
 * @param {string} role
 * @param {string} base ค่าว่างถ้าหน้าปัจจุบันอยู่ที่ root
 */
export function roleHome(role, base = '../') {
    return role === 'admin'
        ? `${base}Admin/Admin_main.html`
        : `${base}Tenant/Main_Tenant.html`;
}

/**
 * path ขึ้นไปถึง root ของเว็บไซต์ เพื่อให้ข้ามโฟลเดอร์ได้จากทุกระดับ
 * เช่น อยู่ที่ /Admin/Admin_Room.html ได้ '../'  อยู่ที่ /Login/Login.html ได้ '../'  อยู่ที่ / ได้ ''
 */
export function rootPrefix() {
    const depth = window.location.pathname.split('/').filter(Boolean).length;
    return depth > 1 ? '../'.repeat(depth - 1) : '';
}

export function goToPage(page) {
    window.location.href = page;
}

/**
 * ป้องกันไม่ให้เข้าหน้าที่ต้องล็อกอิน
 * @param {...string} roles role ที่อนุญาตให้เข้า
 * @returns {Promise<object|null>} profile ของผู้ใช้ (null ถ้าถูกพาทางไปแล้ว)
 */
export async function requireRole(...roles) {
    let session = null;
    let profile = null;

    try {
        session = await getSession();
        if (session) profile = await getMyProfile();
    } catch (error) {
        console.error(error);
    }

    if (!session) {
        goToPage(rootPrefix() + 'Login/Login.html');
        return null;
    }

    if (!profile || (roles.length && !roles.includes(profile.role))) {
        // บัญชีนี้ไม่มีสิทธิ์เข้าหน้านี้ ให้ส่งไปหน้าหลังที่ตรงกับ role จริงแทน
        goToPage(profile ? rootPrefix() + roleHome(profile.role, '') : rootPrefix() + 'Login/Login.html');
        return null;
    }

    return profile;
}

/**
 * ใช้ในหน้าแรก ถ้ามี session อยู่แล้วให้พาไปหน้าหลังของ role นั้นทันที
 * (ครอบคลุมกรณีผู้ใช้คลิกลิงก์ยืนยันอีเมลแล้วกลับมาที่ index.html)
 */
export async function redirectIfSignedIn(base = '') {
    try {
        const session = await getSession();
        if (!session) return false;

        const profile = await getMyProfile();
        goToPage(roleHome(profile?.role, base));
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}
