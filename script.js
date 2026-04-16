/**
 * 🚀 สมองกลน้องนำทาง - เวอร์ชั่นคัดกรองใบขับขี่ + ระบบปริ้นใบนำทาง
 * ปรับปรุง: แก้ไขให้ Checklist ติ๊กได้จริง และปุ่ม Print จะแสดงเมื่อติ๊กครบ
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
let speechSafetyTimeout = null; 
const IDLE_TIME_LIMIT = 15000; 
let video = document.getElementById('video');
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

// --- 1. ระบบจัดการสถานะ ---
function resetSystemState() {
    stopAllSpeech();
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    if (!isAtHome) restartIdleTimer();
}

document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);

function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.classList.remove('muted');
}

// --- 2. ระบบ Reset หน้าจอ ---
function resetToHome() {
    const now = Date.now();
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer(); 
        return;
    }
    if (isAtHome) return; 

    resetSystemState();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       
    isAtHome = true; 

    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); 
}

// --- 3. ระบบดวงตา AI (Face-API) ---
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => { video.play(); loadFaceModels(); };
        }
    } catch (err) { console.error("❌ Camera Error:", err); }
}

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
    requestAnimationFrame(detectPerson);
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined') { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;

    const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
    const face = predictions.find(f => {
        const box = f.detection.box;
        const centerX = box.x + (box.width / 2);
        return f.detection.score > 0.60 && box.width > 160 && (centerX > 100 && centerX < 540);
    });

    if (face) {
        if (personInFrameTime === null) personInFrameTime = now;
        window.detectedGender = face.gender; 
        if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) greetUser(); 
        lastSeenTime = now; 
    } else {
        if (personInFrameTime !== null && (now - lastSeenTime > 3000)) {
            personInFrameTime = null;   
            window.hasGreeted = false;  
            if (!isAtHome) restartIdleTimer();
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    forceUnmute();
    isAtHome = false; 
    const isThai = window.currentLang === 'th';
    const text = isThai ? "สวัสดีครับ มีอะไรให้น้องนำทางช่วยดูแลไหมครับ?" : "Hello! How can I help you today?";
    window.hasGreeted = true; 
    displayResponse(text);
    speak(text);
}

// --- 4. 🚩 ระบบคัดกรองใบขับขี่ (Logic ติ๊กได้จริง) ---

function checkChecklist() {
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    
    // ตรวจสอบว่าติ๊กครบทุกช่องหรือไม่
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    
    // แสดงปุ่มปริ้นเมื่อติ๊กครบเท่านั้น
    if (allChecked) {
        printBtn.style.display = "block";
    } else {
        printBtn.style.display = "none";
    }
}

function startLicenseCheck(type) {
    isAtHome = false;
    const isThai = window.currentLang === 'th';
    const msg = isThai ? `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    
    displayResponse(msg);
    speak(msg);

    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", en: "Not expired / Under 1 year", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ หมดอายุเกิน 1 ปี (แต่ไม่เกิน 3 ปี)", en: "Expired 1-3 years", action: () => showLicenseChecklist(type, 'over1') },
        { th: "❌ หมดอายุเกิน 3 ปี", en: "Expired over 3 years", action: () => showLicenseChecklist(type, 'over3') }
    ]);
}

function showLicenseChecklist(type, expiry) {
    const isThai = window.currentLang === 'th';
    const isTemp = type.includes("ชั่วคราว") || type.includes("2 ปี");
    
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = "";

    // กฎการอบรมตามประเภทใบขับขี่
    if (isTemp) {
        if (expiry === 'normal') note = "ไม่ต้องอบรม ต่อได้ทันที";
        else if (expiry === 'over1') note = "ไม่ต้องอบรม แต่ต้องสอบข้อเขียนใหม่";
        else if (expiry === 'over3') note = "ไม่ต้องอบรม แต่ต้องสอบข้อเขียนและสอบขับรถใหม่";
    } else {
        if (expiry === 'normal') {
            docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)");
            note = "อบรมออนไลน์ 1 ชม. และต่อได้ทันที";
        } else if (expiry === 'over1') {
            docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)");
            note = "อบรมออนไลน์ และต้องสอบข้อเขียนใหม่";
        } else if (expiry === 'over3') {
            note = "ต้องอบรม 5 ชม. ที่ขนส่งเท่านั้น + สอบข้อเขียน + สอบขับรถ";
        }
    }

    // สร้าง HTML ใหม่แบบสะอาด ป้องกันโค้ดหลุด (Fix จากรูป 59348.jpg)
    let checklistItems = "";
    docs.forEach((d, idx) => {
        checklistItems += `
            <div style="display:flex; align-items:center; margin-bottom:12px; background:#f0f2f5; padding:10px; border-radius:8px; cursor:pointer;" onclick="document.getElementById('chk-${idx}').click()">
                <input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" onclick="event.stopPropagation()" style="width:25px; height:25px; cursor:pointer; accent-color:#6c5ce7;">
                <label style="margin-left:12px; font-size:18px; cursor:pointer; color:#2d3436; flex:1;">${d}</label>
            </div>`;
    });

    const resultHTML = `
        <div style="text-align:left; background:white; padding:15px; border-radius:12px;">
            <strong style="font-size:22px; color:#2d3436;">${type}</strong><br>
            <div style="background:#e8f0fe; color:#1a73e8; padding:8px; border-radius:5px; margin-top:5px; font-weight:bold;">💡 ${note}</div>
            <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
            <p style="font-size:15px; color:#636e72; margin-bottom:10px;">กรุณาตรวจสอบเอกสาร (ติ๊กให้ครบเพื่อปริ้น):</p>
            ${checklistItems}
            <button id="btnPrintGuide" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}')" 
                style="display:none; width:100%; padding:15px; background:#28a745; color:white; border:none; border-radius:10px; font-weight:bold; font-size:20px; cursor:pointer; margin-top:15px; box-shadow: 0 4px 6px rgba(40,167,69,0.2);">
                🖨️ ปริ้นใบนำทาง
            </button>
        </div>`;

    displayResponse(resultHTML);
    speak(isThai ? "กรุณาติ๊กตรวจสอบเอกสารให้ครบ แล้วกดปุ่มปริ้นใบนำทางครับ" : "Please check all documents to print your guide.");
}

// --- 5. ระบบค้นหาและจัดการคำถาม ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    if (window.isBusy) stopAllSpeech();
    
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();

    if ((query.includes("ใบขับขี่") || query.includes("license")) && (query.includes("ต่อ") || query.includes("renew"))) {
        if (!query.includes("ชั่วคราว") && !query.includes("5 ปี") && !query.includes("5ปี")) {
            const askMsg = (window.currentLang === 'th') ? "ไม่ทราบว่าใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is your license Temporary or 5-year?";
            displayResponse(askMsg);
            speak(askMsg);
            renderOptionButtons([
                { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
                { th: "แบบ 5 ปี", en: "5-year type", action: () => startLicenseCheck("แบบ 5 ปี") }
            ]);
            window.isBusy = false; 
            return;
        }
    }

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const keys = item[0] ? item[0].toString().toLowerCase() : "";
                if (keys.includes(query)) {
                    bestMatch = { answer: (window.currentLang === 'th' ? item[1] : item[2] || item[1]), score: 10 };
                }
            });
        }

        if (bestMatch.score > 0) {
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else {
            const fb = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ" : "No info found.";
            displayResponse(fb);
            speak(fb);
            setTimeout(renderFAQButtons, 3000);
        }
    } catch (err) { window.isBusy = false; }
}

// --- 6. ระบบเสียงและ UI ---

function speak(text) {
    if (!text || window.isMuted) return;
    window.speechSynthesis.cancel();
    forceUnmute();
    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { window.isBusy = false; updateLottie('idle'); };
    window.speechSynthesis.speak(msg);
}

const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    window.isBusy = false;
    updateLottie('idle');
};

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = qText;
            btn.onclick = () => { stopAllSpeech(); getResponse(qText); };
            container.appendChild(btn);
        }
    });
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return;
    container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.style.border = "2px solid #6c5ce7";
        btn.innerText = (window.currentLang === 'th') ? opt.th : opt.en;
        btn.onclick = () => { 
            stopAllSpeech(); 
            if (opt.action) opt.action();
        };
        container.appendChild(btn);
    });
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

function displayResponse(text) {
    document.getElementById('response-text').innerHTML = text.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
}

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            renderFAQButtons();
            initCamera();
            displayResponse("ระบบพร้อมให้บริการแล้วครับ");
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

initDatabase();
