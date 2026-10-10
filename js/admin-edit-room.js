// หน้าแก้ไขข้อมูลห้อง (Admin/Admin_editRoom.html)
//
// เดิมเก็บข้อมูลห้องทั้งหมดไว้ใน localStorage พร้อมรูปที่เข้ารหัสเป็น base64
// ทำให้ข้อมูลหายเมื่อเปลี่ยนเครื่อง และโกงลิมิตขนาด จึงย้ายไปเก็บในตาราง room / tenant
// และเก็บรูปไว้ใน Supabase Storage (bucket room-images) โดยเก็บแค่ path ใน room.room_images

import { supabase } from '../Client.js';
import { requireRole, friendlyError } from './auth.js';

const BUCKET = 'room-images';
const MAX_WIDTH = 800;
const MAX_HEIGHT = 800;

const roomNumberParam = new URLSearchParams(window.location.search).get('room');
const saveConfirmModal = document.getElementById('saveConfirmModal');
const imageInput = document.getElementById('imageInput');
const imageContainer = document.getElementById('imageContainer');
const imagePreviewModal = document.getElementById('imagePreviewModal');
const previewImage = document.getElementById('previewImage');

let roomRow = null;
// ผู้เช่าปัจจุบันของห้อง (มาจากตาราง profiles)
let currentOccupant = null;
// บัญชีผู้ใช้ทุกคนที่มี role = tenant ใช้ค้นหาในช่องพิมพ์ชื่อ
let tenantCandidates = [];
// id ของผู้เช่าที่ถูกเลือกจริงจากรายการค้นหา (null = ยังไม่เลือก/ว่าง)
let selectedTenantId = null;
let currentImages = [];

// รูปที่เพิ่มในรอบนี้ยังไม่ได้อัปโหลด เก็บไว้ก่อนตอนกดบันทึก
let pendingFiles = [];

// path ของรูปเดิมที่ผู้ใช้เอาออกจากรายการ
// ยังไม่ลบไฟล์จริงจนกว่ากดบันทึกสำเร็จ ถ้าผู้ใช้กดยกเลิกรูปต้องไม่หายเอง
let removedImagePaths = [];

function storageUrl(path) {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * room.room_images เก็บได้ทั้งแบบชื่อไฟล์เดี่ยว (ข้อมูลเก่า) และแบบหลายรูปคั่นด้วย comma
 */
function parseImagePaths(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function renderImages() {
    imageContainer.innerHTML = '';

    if (currentImages.length === 0) {
        imageContainer.innerHTML = '<p class="text-sm text-gray-400 text-center py-10">ยังไม่มีรูปภาพของห้องนี้</p>';
        return;
    }

    currentImages.forEach((image, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative group';
        wrapper.innerHTML = `
            <img src="${image.url}" class="w-full h-48 object-cover rounded-[16px] cursor-pointer hover:opacity-90 transition-opacity border border-gray-100" alt="room preview">
            <button class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-10 border-2 border-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
        `;

        wrapper.querySelector('img').addEventListener('click', () => {
            previewImage.src = image.url;
            imagePreviewModal.classList.remove('hidden');
        });

        wrapper.querySelector('button').addEventListener('click', () => removeImage(index));
        imageContainer.appendChild(wrapper);
    });
}

function removeImage(index) {
    const [removed] = currentImages.splice(index, 1);
    if (!removed) return;

    if (removed.path.startsWith('local:')) {
        // รูปที่เพิ่งเลือกยังไม่ได้อัปโหลด ต้องเอาไฟล์ออกจากคิวด้วย ไม่ให้ถูกอัปโหลดตอนบันทึก
        pendingFiles = pendingFiles.filter((file) => file !== removed.file);
        URL.revokeObjectURL(removed.url);
    } else {
        // รูปเดิมอยู่บน Storage แล้ว รอลบตอนบันทึกสำเร็จค่อยลบ
        removedImagePaths.push(removed.path);
    }

    renderImages();
}

/**
 * ย่อรูปในเบราว์เซอร์ก่อนอัปโหลด เพื่อไม่ให้ไฟล์ใหญ่เกินไป
 */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
        reader.onload = (event) => {
            const img = new Image();

            img.onerror = () => reject(new Error('ไฟล์รูปไม่ถูกต้อง'));
            img.onload = () => {
                let { width, height } = img;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }

                const canvas = document.createElement('canvas');
                canvas.width = Math.round(width);
                canvas.height = Math.round(height);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('ย่อรูปไม่สำเร็จ'));
                        return;
                    }
                    resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.7);
            };

            img.src = event.target.result;
        };

        reader.readAsDataURL(file);
    });
}

async function handleImageSelection(files) {
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;

        try {
            const compressed = await compressImage(file);
            pendingFiles.push(compressed);
            currentImages.push({
                path: `local:${compressed.name}`,
                url: URL.createObjectURL(compressed),
                file: compressed,
            });
            renderImages();
        } catch (error) {
            showFieldError(error.message || String(error));
        }
    }
}

async function uploadPendingFiles() {
    const uploaded = [];

    for (const file of pendingFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${roomRow.room_number}/${Date.now()}-${safeName}`;

        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
            cacheControl: '3600',
            upsert: false,
        });

        if (error) throw new Error(friendlyError(error));
        uploaded.push(path);
    }

    return uploaded;
}

function tenantLabel(tenant) {
    const phone = tenant.phone_number ? ` • ${tenant.phone_number}` : '';
    return `${tenant.full_name || 'ไม่ระบุชื่อ'}${phone}`;
}

function tenantStatus(tenant) {
    if (currentOccupant && tenant.id === currentOccupant.id) {
        return `ผู้เช่าปัจจุบัน (ห้อง ${roomRow.room_number})`;
    }
    return tenant.room_number ? `อยู่ห้อง ${tenant.room_number}` : 'ยังไม่มีห้อง';
}

function matchTenantByName(text) {
    const query = text.trim().toLowerCase();
    if (!query) return null;
    return tenantCandidates.find((tenant) => (tenant.full_name || '').trim().toLowerCase() === query) ?? null;
}

function setTenantError(message) {
    const input = document.getElementById('tenantSearch');
    const errorEl = document.getElementById('tenantError');

    if (message) {
        input.classList.remove('border-gray-300');
        input.classList.add('border-red-400', 'focus:border-red-400', 'focus:ring-red-300');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    } else {
        input.classList.remove('border-red-400', 'focus:border-red-400', 'focus:ring-red-300');
        input.classList.add('border-gray-300');
        errorEl.classList.add('hidden');
    }
}

function hideSuggestions() {
    document.getElementById('tenantSuggest').classList.add('hidden');
}

function renderSuggestions(query) {
    const box = document.getElementById('tenantSuggest');
    const keyword = query.trim().toLowerCase();

    const matches = tenantCandidates
        .filter((tenant) => {
            if (!keyword) return true;
            const name = (tenant.full_name || '').toLowerCase();
            const phone = (tenant.phone_number || '').toLowerCase();
            return name.includes(keyword) || phone.includes(keyword);
        })
        .slice(0, 3);

    box.innerHTML = '';

    if (matches.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'px-4 py-3 text-sm text-gray-400';
        empty.textContent = 'ไม่พบบัญชีที่ตรงกับคำค้น';
        box.appendChild(empty);
        box.classList.remove('hidden');
        return;
    }

    for (const tenant of matches) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors border-b border-gray-50 last:border-b-0';

        const nameEl = document.createElement('span');
        nameEl.className = 'block text-sm font-medium text-gray-800';
        nameEl.textContent = tenantLabel(tenant);

        const statusEl = document.createElement('span');
        statusEl.className = 'block text-xs text-gray-400';
        statusEl.textContent = tenantStatus(tenant);

        item.append(nameEl, statusEl);
        item.addEventListener('mousedown', (event) => {
            event.preventDefault();
            selectTenant(tenant);
        });
        box.appendChild(item);
    }

    box.classList.remove('hidden');
}

function selectTenant(tenant) {
    selectedTenantId = tenant.id;
    document.getElementById('tenantSearch').value = tenant.full_name || '';
    document.getElementById('tenantPhone').value = tenant.phone_number ?? '';
    setTenantError(null);
    hideSuggestions();
}

// อัปเดตสถานะการเลือกเมื่อผู้ใช้พิมพ์เอง (ไม่ผ่านการคลิก suggestion)
function syncTenantFromInput() {
    const input = document.getElementById('tenantSearch');
    const text = input.value.trim();
    const exact = matchTenantByName(text);

    if (!text) {
        selectedTenantId = null;
        document.getElementById('tenantPhone').value = '';
        setTenantError(null);
        return;
    }

    if (exact) {
        selectedTenantId = exact.id;
        document.getElementById('tenantPhone').value = exact.phone_number ?? '';
        setTenantError(null);
    } else {
        selectedTenantId = null;
        document.getElementById('tenantPhone').value = '';
    }
}

// ตรวจว่าชื่อที่พิมพ์ตรงกับบัญชีในระบบหรือไม่ ถ้าไม่ให้โชว์ error ตรงกล่องข้อความ
function checkTenantInput() {
    const text = document.getElementById('tenantSearch').value.trim();

    if (!text || selectedTenantId) {
        setTenantError(null);
        return null;
    }

    const message = `ไม่พบบัญชีผู้ใช้ "${text}" ในระบบ กรุณาเลือกจากรายการที่แสดง`;
    setTenantError(message);
    return message;
}

function fillForm() {
    document.getElementById('roomNum').value = roomRow.room_number;
    document.getElementById('roomPrice').value = roomRow.room_price ?? '';
    document.getElementById('elecRate').value = roomRow.elec_rate ?? '';
    document.getElementById('waterRate').value = roomRow.water_rate ?? '';

    const typeSelect = document.getElementById('roomType');
    if (roomRow.room_type) typeSelect.value = roomRow.room_type;

    document.getElementById('additionalInfo').value = roomRow.additional_info ?? '';
    document.getElementById('roomNum').readOnly = true;

    selectedTenantId = currentOccupant?.id ?? null;
    document.getElementById('tenantSearch').value = currentOccupant?.full_name ?? '';
    document.getElementById('tenantPhone').value = currentOccupant?.phone_number ?? '';
    setTenantError(null);
    hideSuggestions();

    currentImages = parseImagePaths(roomRow.room_images).map((path) => ({ path, url: storageUrl(path) }));
    renderImages();
}

function collectPayload() {
    return {
        tenantText: document.getElementById('tenantSearch').value.trim(),
        roomPrice: document.getElementById('roomPrice').value.trim(),
        elecRate: document.getElementById('elecRate').value.trim(),
        waterRate: document.getElementById('waterRate').value.trim(),
        roomType: document.getElementById('roomType').value,
        additionalInfo: document.getElementById('additionalInfo').value.trim(),
    };
}

function showFieldError(msg) {
    const errorEl = document.getElementById('tenantError');
    const input = document.getElementById('tenantSearch');
    if (!errorEl) {
        window.alert(msg);
        return;
    }
    input?.classList.remove('border-gray-300');
    input?.classList.add('border-red-400', 'focus:border-red-400', 'focus:ring-red-300');
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    window.clearTimeout(showFieldError._timer);
    showFieldError._timer = window.setTimeout(() => setTenantError(null), 3000);
}

function validate(payload) {
    const hasTenant = payload.tenantText !== '';

    if (hasTenant) {
        if (!selectedTenantId) {
            return `ไม่พบบัญชีผู้ใช้ "${payload.tenantText}" ในระบบ กรุณาเลือกจากรายการที่แสดง`;
        }
        if (!payload.roomPrice || !payload.elecRate || !payload.waterRate) {
            return 'กรุณากรอกราคาห้อง ค่าไฟ และค่าน้ำ ให้ครบถ้วน เนื่องจากมีการระบุข้อมูลผู้เช่า';
        }
        if (!payload.roomType) return 'กรุณาเลือกประเภทห้อง';
    }

    return null;
}

async function save() {
    const payload = collectPayload();
    const error = validate(payload);
    if (error) {
        if (payload.tenantText && !selectedTenantId) setTenantError(error);
        else showFieldError(String(error));
        return;
    }

    const currentId = currentOccupant?.id ?? null;
    const selectedId = selectedTenantId;

    // ถ้าไม่เลือกผู้เช่า แต่ห้องมีผู้เช่าอยู่ ต้องยืนยันก่อนนำผู้เช่าออก
    if (!selectedId && currentId) {
        const name = currentOccupant.full_name || 'ผู้เช่า';
        if (!window.confirm(`ต้องการนำ ${name} ออกจากห้อง ${roomRow.room_number} หรือไม่?`)) return;
    }

    const confirmButton = document.getElementById('confirmSaveBtn');
    confirmButton.disabled = true;
    confirmButton.textContent = 'กำลังบันทึก...';

    try {
        const uploaded = await uploadPendingFiles();
        const paths = [
            ...currentImages.map((image) => image.path).filter((path) => !path.startsWith('local:')),
            ...uploaded,
        ];

        const { error: roomError } = await supabase
            .from('room')
            .update({
                room_price: payload.roomPrice ? Number(payload.roomPrice) : null,
                elec_rate: payload.elecRate ? Number(payload.elecRate) : null,
                water_rate: payload.waterRate ? Number(payload.waterRate) : null,
                room_type: payload.roomType || null,
                additional_info: payload.additionalInfo || null,
                room_images: paths.length ? paths : null,
            })
            .eq('room_number', roomRow.room_number);

        if (roomError) throw new Error(friendlyError(roomError));

        // บันทึกห้องสำเร็จแล้วจึงลบรูปเดิมที่ผู้ใช้เอาออกจากรายการ
        if (removedImagePaths.length) {
            const { error: removeError } = await supabase.storage.from(BUCKET).remove(removedImagePaths);
            if (removeError) console.warn('ลบรูปที่เอาออกไม่สำเร็จ', removeError.message);
            removedImagePaths = [];
        }

        // ย้ายเข้า/ย้ายออก: แก้ room_number ของ profiles (trigger จะ sync ไปตาราง tenant ให้เอง)
        if (selectedId !== currentId) {
            if (currentId) await moveTenant(currentId, null);
            if (selectedId) await moveTenant(selectedId, roomRow.room_number);
        }

        saveConfirmModal.classList.replace('flex', 'hidden');
        window.location.href = 'Admin_Room.html';
    } catch (err) {
        showFieldError('บันทึกไม่สำเร็จ: ' + (err.message || String(err)));
    } finally {
        confirmButton.disabled = false;
        confirmButton.textContent = 'ยืนยัน';
    }
}

async function moveTenant(userId, roomNumber) {
    if (!userId) throw new Error('ผู้ใช้รายนี้ยังไม่มีบัญชีในระบบ');

    const { error } = await supabase
        .from('profiles')
        .update({ room_number: roomNumber })
        .eq('id', userId);

    if (error) throw new Error(friendlyError(error));
}

async function loadRoom() {
    if (!roomNumberParam) {
        showFieldError('ไม่พบเลขห้องที่ต้องการแก้ไข (ต้องเปิดด้วย ?room=เลขห้อง)');
        return;
    }

    const { data: room, error: roomError } = await supabase
        .from('room')
        .select('room_number, room_type, room_price, elec_rate, water_rate, additional_info, room_images')
        .eq('room_number', roomNumberParam)
        .maybeSingle();

    if (roomError) throw new Error(friendlyError(roomError));
    if (!room) {
        showFieldError(`ไม่พบห้อง ${roomNumberParam}`);
        return;
    }

    roomRow = room;

    // ผู้เช่าปัจจุบันของห้อง (profiles เป็นแหล่งข้อมูลหลัก)
    const { data: occupants, error: occupantError } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number, room_number')
        .eq('room_number', roomNumberParam);
    if (occupantError) throw new Error(friendlyError(occupantError));
    currentOccupant = occupants?.[0] ?? null;

    // แสดงเฉพาะบัญชีผู้เช่าที่ยังไม่มีห้อง + ผู้เช่าปัจจุบันของห้องนี้
    const { data: tenants, error: tenantsError } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number, room_number')
        .eq('role', 'tenant')
        .is('room_number', null)
        .order('full_name');
    if (tenantsError) throw new Error(friendlyError(tenantsError));

    tenantCandidates = tenants ?? [];
    if (currentOccupant && !tenantCandidates.some((tenant) => tenant.id === currentOccupant.id)) {
        tenantCandidates.push(currentOccupant);
    }

    fillForm();
}

async function init() {
    const allowed = await requireRole('admin');
    if (!allowed) return;

    imagePreviewModal.addEventListener('click', () => imagePreviewModal.classList.add('hidden'));

    document.getElementById('addImageBtn').addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (event) => {
        handleImageSelection(Array.from(event.target.files));
        imageInput.value = '';
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
        const payload = collectPayload();
        const error = validate(payload);
        if (error) {
            if (payload.tenantText && !selectedTenantId) setTenantError(error);
            else showFieldError(String(error));
            return;
        }
        saveConfirmModal.classList.replace('hidden', 'flex');
    });

    document.getElementById('cancelSaveBtn').addEventListener('click', () => {
        saveConfirmModal.classList.replace('flex', 'hidden');
    });

    document.getElementById('confirmSaveBtn').addEventListener('click', save);

    saveConfirmModal.addEventListener('click', (event) => {
        if (event.target === saveConfirmModal) saveConfirmModal.classList.replace('flex', 'hidden');
    });

    document.getElementById('clearTenantBtn').addEventListener('click', () => {
        selectedTenantId = null;
        document.getElementById('tenantSearch').value = '';
        document.getElementById('tenantPhone').value = '';
        setTenantError(null);
        hideSuggestions();
    });

    const tenantSearch = document.getElementById('tenantSearch');
    tenantSearch.addEventListener('input', () => {
        syncTenantFromInput();
        renderSuggestions(tenantSearch.value);
    });
    tenantSearch.addEventListener('focus', () => {
        renderSuggestions(tenantSearch.value);
    });
    tenantSearch.addEventListener('blur', () => {
        // หน่วงให้ mousedown ของ suggestion ทำงานก่อน (กันการเลือกไม่ติด)
        setTimeout(() => {
            hideSuggestions();
            checkTenantInput();
        }, 150);
    });

    document.getElementById('resetBtn').addEventListener('click', () => window.location.reload());

    try {
        await loadRoom();
    } catch (error) {
        showFieldError('โหลดข้อมูลห้องไม่สำเร็จ: ' + (error.message || String(error)));
    }
}

localStorage.removeItem('dormRoomsData');

init();