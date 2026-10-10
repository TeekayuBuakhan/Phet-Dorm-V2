// ระบบแถบนำทางของผู้เช่า (หน้าหลัก / ค่าเช่า / แจ้งเหตุ)
//
// ทำให้แถบไฮไลต์ (slide-indicator) เลื่อนอย่างนุ่มนวล และไม่กระพริบตอนสลับหน้า:
//   - ตอนโหลดหน้าใหม่ จะวางแถบไฮไลต์ตรงแท็บที่ active ทันที (ไม่ย้อนกลับไปเลื่อนซ้ำ)
//   - ตอนกด จะเลื่อนแถบไปแท็บที่กดก่อน แล้วรอให้แถบเลื่อนเสร็จ (SLIDE_MS) ค่อยเปลี่ยนหน้า
//   - จัดตำแหน่งแถบใหม่ทันทีเมื่อฟอนต์/ขนาดจอเปลี่ยน เพื่อไม่ให้ตำแหน่งเพี้ยน
//
// ใช้ร่วมกับ Main_Tenant.html / Bill.html / Repair.html
// ต้องมี: <nav id="main-nav">, #slide-indicator, ปุ่ม .nav-btn[data-href]

const EASE = 'cubic-bezier(0.2, 1, 0.2, 1)';
const SLIDE_MS = 300;

const getIndicator = () => document.getElementById('slide-indicator');
const getNavButtons = () => Array.from(document.querySelectorAll('#main-nav .nav-btn'));
const normalize = (value) => (value || '').toLowerCase();
const getCurrentPage = () => normalize(window.location.pathname.split('/').pop());

function getActiveButton() {
    return getNavButtons().find((btn) => normalize(btn.getAttribute('data-href')) === getCurrentPage())
        || getNavButtons()[0];
}

// วางแถบไฮไลต์ตรงแท็บเป้าหมายทันที (ไม่มีการเคลื่อนไหว) — ใช้ตอนโหลดหน้าใหม่
function placeIndicatorInstant(target) {
    const indicator = getIndicator();
    if (!indicator || !target) return;
    indicator.style.transition = 'none';
    indicator.style.left = `${target.offsetLeft}px`;
    indicator.style.width = `${target.offsetWidth}px`;
    indicator.style.opacity = '1';
    void indicator.offsetWidth;
    indicator.style.transition = '';
}

// เลื่อนแถบไฮไลต์อย่างนุ่มนวล
function slideIndicatorTo(target) {
    const indicator = getIndicator();
    if (!indicator || !target) return;
    indicator.style.transition = `left ${SLIDE_MS}ms ${EASE}, width ${SLIDE_MS}ms ${EASE}, opacity 200ms ${EASE}`;
    indicator.style.left = `${target.offsetLeft}px`;
    indicator.style.width = `${target.offsetWidth}px`;
    indicator.style.opacity = '1';
}

function setActiveButton(target) {
    getNavButtons().forEach((btn) => btn.classList.toggle('text-active', btn === target));
}

function gotoPage(page) {
    if (!page) return;
    const target = getNavButtons().find((btn) => normalize(btn.getAttribute('data-href')) === normalize(page));

    // กดแท็บที่เปิดอยู่แล้ว — เลื่อนแถบให้ตรงเฉย ๆ ไม่ต้องโหลดหน้าใหม่
    if (normalize(page) === getCurrentPage()) {
        if (target) { slideIndicatorTo(target); setActiveButton(target); }
        return;
    }

    // เลื่อนแถบไปปุ่มที่กดก่อน แล้วค่อยเปลี่ยนหน้า เพื่อให้เห็นการไหลต่อเนื่อง
    if (target) { setActiveButton(target); slideIndicatorTo(target); }
    window.setTimeout(() => { window.location.href = page; }, SLIDE_MS);
}

window.gotoPage = gotoPage;

document.addEventListener('DOMContentLoaded', () => {
    const active = getActiveButton();
    placeIndicatorInstant(active);
    setActiveButton(active);

    getNavButtons().forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            gotoPage(btn.getAttribute('data-href'));
        });
    });

    // ฟอนต์โหลดช้า/ขนาดหน้าจอเปลี่ยน อาจทำให้ตำแหน่งแท็บขยับ — จัดใหม่แบบไม่กระพริบ
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => placeIndicatorInstant(getActiveButton()));
    }
    let resizeTimer;
    window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => placeIndicatorInstant(getActiveButton()), 150);
    });
});