// ฟังก์ชันช่วยเล็กๆ ที่ใช้ร่วมกันในหน้าเว็บ

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const MESSAGE_TONES = {
    error: 'text-red-600',
    success: 'text-green-600',
    info: 'text-gray-500',
};

/**
 * แสดงข้อความแจ้งเตือนในกล่องข้อความของฟอร์ม
 * @param {HTMLElement|null} element
 * @param {string} text
 * @param {'error'|'success'|'info'} tone
 */
export function setMessage(element, text, tone = 'error') {
    if (!element) return;

    element.textContent = text;
    element.className = `text-sm font-medium ${MESSAGE_TONES[tone] ?? MESSAGE_TONES.error}`;

    if (text) element.classList.remove('hidden');
    else element.classList.add('hidden');
}

/**
 * ปิดปุ่มไว้ระหว่างกำลังส่งคำขอ เพื่อไม่ให้กดซ้ำจนโควตาอีเมลหมด
 */
export function setBusy(button, isBusy, busyText = 'กำลังดำเนินการ...') {
    if (!button) return;

    if (isBusy) {
        button.dataset.originalText = button.textContent;
        button.textContent = busyText;
        button.disabled = true;
        button.classList.add('opacity-60', 'cursor-not-allowed');
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
        button.classList.remove('opacity-60', 'cursor-not-allowed');
    }
}

/**
 * ทำให้ช่องกรอกข้อมูลขึ้นสีแดงเมื่อ validation ไม่ผ่าน
 */
export function markInvalid(input, isInvalid) {
    if (!input) return;

    input.classList.toggle('border-red-500', isInvalid);
    input.classList.toggle('focus:ring-red-200', isInvalid);
}
