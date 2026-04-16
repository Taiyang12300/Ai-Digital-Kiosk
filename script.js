/**
 * 🚀 สมองกลน้องนำทาง - ฉบับสมบูรณ์ (Checklist + Print + AI Camera)
 * รวม Logic คัดกรองใน Code และการค้นหาจาก Google Sheet
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
const IDLE_TIME_LIMIT = 20000; // 20 วินาทีกลับหน้าโฮม
let video = document.getElementById('video');
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

// --- 1. ระบบจัดการ Checklist & Print ---

function checkChecklist() {
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    
    // ติ๊กครบทุกอันถึงจะโชว์ปุ่มปริ้น
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    printBtn.style.display = allChecked ? "block" : "none";
}

function generateChecklistHTML(type, note, docs) {
    let html = `<div style="text-align:left; border:2px solid #6c5ce7; padding:15px; border-radius:15px; background:#fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">`;
    html += `<strong style="font-size:20px; color:#6c5ce7;">${type}</strong><br>`;
    html += `<span style="color:#e67e22; font-weight:bold;">💡 ${note}</span><hr style="border:0.5px dashed #6c5ce7; margin:15px 0;">`;
    html += `<p style="margin-bottom:10px; font-size:16px; font-weight:bold;">กรุณาติ๊กเตรียมเอกสารให้ครบ:</p>`;
    
    docs.forEach((d, idx) => {
        html += `
            <div style="margin-bottom:12px; display:flex; align-items:center; gap:12px;">
                <input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" style="width:25px; height:25px; cursor:pointer;">
                <label for="chk-${idx}" style="font-size:18px; cursor:pointer;">${d}</label>
            </div>
        `;
    });

    html += `
        <button id="btnPrintGuide" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}')" 
            style="display:none; width:100%; padding:15px; background:#27ae60; color:white; border:none; border-radius:10px; font-weight:bold; font-size:20px; margin-top:10px; cursor:pointer;">
            🖨️ ปริ้นใบนำทาง
        </button></div>`;
    return html;
}

// --- 2. ระบบคัดกรองใบขับขี่ (Logic ใน Code) ---

function startLicenseCheck(type) {
    const isThai = window.currentLang === 'th';
    const msg = isThai ? `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    displayResponse(msg);
    speak(msg);

    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", en: "Not expired", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ หมดอายุเกิน 1 ปี", en: "Expired 1-3 years", action: () => showLicenseChecklist(type, 'over1') },
        { th: "❌ หมดอายุเกิน 3 ปี", en: "Expired over 3 years", action: () => showLicenseChecklist(type, 'over3') }
    ]);
}

function showLicenseChecklist(type, expiry) {
    const isTemp = type.includes("ชั่วคราว") || type.includes("2 ปี");
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = "";

    if (isTemp) {
        if (expiry === 'normal') note = "ไม่ต้องอบรม ต่อได้ทันที";
        else if (expiry === 'over1') note = "ไม่ต้องอบรม แต่ต้องสอบข้อเขียนใหม่";
        else if (expiry === 'over3') note = "ไม่ต้องอบรม แต่ต้องสอบข้อเขียนและสอบขับรถใหม่";
    } else {
        if (expiry === 'normal') { docs.push("ผลผ่านการอบรมออนไลน์"); note = "อบรมออนไลน์ 1 ชม. และต่อได้ทันที"; }
        else if (expiry === 'over1') { docs.push("ผลผ่านการอบรมออนไลน์"); note = "อบรมออนไลน์ และต้องสอบข้อเขียนใหม่"; }
        else if (expiry === 'over3') note = "ต้องอบรม 5 ชม. ที่ขนส่ง + สอบข้อเขียน + สอบขับรถ";
    }

    displayResponse(generateChecklistHTML(type, note, docs));
    speak(window.currentLang === 'th' ? "ติ๊กรายการเอกสารให้ครบเพื่อปริ้นครับ" : "Check all items to print.");
}

// --- 3. ระบบค้นหา (getResponse) ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    stopAllSpeech();
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();
    const isThai = window.currentLang === 'th';

    // เช็ค Keyword ใบขับขี่เพื่อเข้า Logic คัดกรอง
    if ((query.includes("ใบขับขี่") || query.includes("license")) && (query.includes("ต่อ") || query.includes("renew"))) {
        if (!query.includes("ชั่วคราว") && !query.includes("2 ปี") && !query.includes("5 ปี") && !query.includes("5ปี")) {
            const askMsg = isThai ? "เป็นใบขับขี่ชั่วคราว หรือแบบ 5 ปีครับ?" : "Temporary or 5-year?";
            displayResponse(askMsg);
            speak(askMsg);
            renderOptionButtons([
                { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
                { th: "แบบ 5 ปี", en: "5-year type", action: () => startLicenseCheck("แบบ 5 ปี") }
            ]);
            window.isBusy = false; return;
        } else if (query.includes("ชั่วคราว") || query.includes("2 ปี")) {
            startLicenseCheck("แบบชั่วคราว (2 ปี)"); return;
        } else {
            startLicenseCheck("แบบ 5 ปี"); return;
        }
    }

    // ถ้าไม่ใช่เรื่องใบขับขี่ ให้หาใน Google Sheet
    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["FAQ", "Config", "Lottie_State"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const keys = item[0] ? item[0].toString().toLowerCase() : "";
                if (keys && (query.includes(keys) || keys.includes(query))) {
                    bestMatch = { answer: isThai ? item[1] : (item[2] || item[1]), score: 10 };
                }
            });
        }

        if (bestMatch.answer) {
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else {
            const fb = isThai ? "ขออภัยครับ ไม่พบข้อมูลในระบบ" : "Information not found.";
            displayResponse(fb);
            speak(fb);
            setTimeout(renderFAQButtons, 3000);
        }
    } catch (e) { console.error(e); }
    window.isBusy = false;
    updateLottie('idle');
}

// --- 4. ระบบเสียงและ AI (คงเดิม) ---

function speak(text) {
    if (!text || window.isMuted) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]|<[^>]*>?/gm, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { updateLottie('talking'); window.isBusy = true; };
    msg.onend = () => { updateLottie('idle'); window.isBusy = false; };
    window.speechSynthesis.speak(msg);
}

function stopAllSpeech() {
    window.speechSynthesis.cancel();
    updateLottie('idle');
    window.isBusy = false;
}

function displayResponse(text) {
    const box = document.getElementById('response-text');
    if (box) box.innerHTML = text.replace(/\\n/g, '<br>');
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.innerText = (window.currentLang === 'th') ? row[0] : row[1];
        btn.onclick = () => { stopAllSpeech(); getResponse(btn.innerText); };
        container.appendChild(btn);
    });
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return;
    container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.style.borderColor = "#6c5ce7";
        btn.innerText = (window.currentLang === 'th') ? opt.th : opt.en;
        btn.onclick = () => { stopAllSpeech(); if(opt.action) opt.action(); };
        container.appendChild(btn);
    });
}

// --- 5. ระบบ Reset และ Face-API (คงเดิม) ---

function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }
document.addEventListener('mousedown', updateInteractionTime);

function resetToHome() {
    if (window.isBusy || personInFrameTime !== null || (Date.now() - lastSeenTime < IDLE_TIME_LIMIT)) return;
    if (isAtHome) return;
    stopAllSpeech();
    window.hasGreeted = false;
    isAtHome = true;
    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons();
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

// (ฟังก์ชัน initCamera, detectPerson, initDatabase เหมือนต้นฉบับของพี่)
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        window.localDatabase = json.database;
        renderFAQButtons();
        // เรียกใช้ Camera หลังจากโหลด DB เสร็จ
        if (typeof initCamera === "function") initCamera();
    } catch (e) { console.error("DB Load Error"); }
}

function updateLottie(state) {
    const player = document.getElementById('lottie-canvas');
    if (!player) return;
    const assets = {
        'idle': 'https://lottie.host/568e8594-a319-4491-bf10-a0f5c012fc76/6S3urqybG5.json',
        'thinking': 'https://lottie.host/e742c203-f211-4521-a5aa-96cd5248d4b8/CKCd2cqmGj.json',
        'talking': 'https://lottie.host/79a24a65-7d74-4ff7-8ac5-bb3eeaa49073/4BES9eWBuE.json'
    };
    player.load(assets[state]);
}

initDatabase();
