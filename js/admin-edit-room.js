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
let tenantRow = null;
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
            alert(error.message);
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

function fillForm() {
    document.getElementById('tenantName').value = tenantRow?.full_name ?? '';
    document.getElementById('tenantPhone').value = tenantRow?.phone_number ?? '';
    document.getElementById('roomNum').value = roomRow.room_number;
    document.getElementById('roomPrice').value = roomRow.room_price ?? '';
    document.getElementById('elecRate').value = roomRow.elec_rate ?? '';
    document.getElementById('waterRate').value = roomRow.water_rate ?? '';

    const typeSelect = document.getElementById('roomType');
    if (roomRow.room_type) typeSelect.value = roomRow.room_type;

    document.getElementById('additionalInfo').value = roomRow.additional_info ?? '';
    document.getElementById('roomNum').readOnly = true;

    currentImages = parseImagePaths(roomRow.room_images).map((path) => ({ path, url: storageUrl(path) }));
    renderImages();
}

function collectPayload() {
    return {
        tenantName: document.getElementById('tenantName').value.trim(),
        tenantPhone: document.getElementById('tenantPhone').value.trim(),
        roomPrice: document.getElementById('roomPrice').value.trim(),
        elecRate: document.getElementById('elecRate').value.trim(),
        waterRate: document.getElementById('waterRate').value.trim(),
        roomType: document.getElementById('roomType').value,
        additionalInfo: document.getElementById('additionalInfo').value.trim(),
    };
}

function validate(payload) {
    const hasTenant = payload.tenantName !== '' || payload.tenantPhone !== '';

    if (hasTenant) {
        if (!payload.tenantName) return 'กรุณากรอกชื่อผู้เช่า';
        if (payload.tenantPhone && !/^0\d{9}$/.test(payload.tenantPhone.replace(/[\s-]/g, ''))) {
            return 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักและขึ้นต้นด้วย 0';
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
        alert(error);
        return;
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
                room_images: paths.length ? paths.join(',') : null,
            })
            .eq('room_number', roomRow.room_number);

if (roomError) throw new Error(friendlyError(roomError));

        // บันทึกห้องสำเร็จแล้วจึงลบรูปเดิมที่ผู้ใช้เอาออกจากรายการ
        if (removedImagePaths.length) {
            const { error: removeError } = await supabase.storage.from(BUCKET).remove(removedImagePaths);
            if (removeError) console.warn('ลบรูปที่เอาออกไม่สำเร็จ', removeError.message);
            removedImagePaths = [];
        }

        if (tenantRow) {
            const hasTenantInfo = payload.tenantName !== '' || payload.tenantPhone !== '';

            if (hasTenantInfo) {
                const { error: tenantError } = await supabase
                    .from('tenant')
                    .update({
                        full_name: payload.tenantName || tenantRow.full_name,
                        phone_number: payload.tenantPhone || tenantRow.phone_number,
                    })
                    .eq('tenant_id', tenantRow.tenant_id);

                if (tenantError) throw new Error(friendlyError(tenantError));
            } else if (window.confirm('ยังไม่ได้กรอกข้อมูลผู้เช่า ต้องการนำผู้เช่าออกจากห้องนี้หรือไม่?')) {
                const { error: tenantError } = await supabase
                    .from('tenant')
                    .update({ room_number: null })
                    .eq('tenant_id', tenantRow.tenant_id);

                if (tenantError) throw new Error(friendlyError(tenantError));
            }
        }

        saveConfirmModal.classList.replace('flex', 'hidden');
        window.location.href = 'Admin_Room.html';
    } catch (err) {
        alert(`บันทึกไม่สำเร็จ: ${err.message}`);
    } finally {
        confirmButton.disabled = false;
        confirmButton.textContent = 'ยืนยัน';
    }
}

async function loadRoom() {
    if (!roomNumberParam) {
        alert('ไม่พบเลขห้องที่ต้องการแก้ไข (ต้องเปิดด้วย ?room=เลขห้อง)');
        return;
    }

    const { data: room, error: roomError } = await supabase
        .from('room')
        .select('room_number, room_type, room_price, elec_rate, water_rate, additional_info, room_images')
        .eq('room_number', roomNumberParam)
        .maybeSingle();

    if (roomError) throw new Error(friendlyError(roomError));
    if (!room) {
        alert(`ไม่พบห้อง ${roomNumberParam}`);
        return;
    }

    roomRow = room;

    const { data: tenant } = await supabase
        .from('tenant')
        .select('tenant_id, full_name, phone_number')
        .eq('room_number', roomNumberParam)
        .maybeSingle();

    tenantRow = tenant;
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
        const error = validate(collectPayload());
        if (error) {
            alert(error);
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
        document.getElementById('tenantName').value = '';
        document.getElementById('tenantPhone').value = '';
    });

    document.getElementById('resetBtn').addEventListener('click', () => window.location.reload());

    try {
        await loadRoom();
    } catch (error) {
        alert(`โหลดข้อมูลห้องไม่สำเร็จ: ${error.message}`);
    }
}

localStorage.removeItem('dormRoomsData');

init();