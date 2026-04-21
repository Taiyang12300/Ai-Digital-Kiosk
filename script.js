/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Full Complete Edition)
 * รวมทุกฟังก์ชัน: ฐานข้อมูล GAS, ตรวจจับใบหน้า, ระบบใบขับขี่, และระบบจัดการไมค์ Refactored
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false; 
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
const IDLE_TIME_LIMIT = 5000; 
let video; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

let wakeWordRecognition;
let micHardLock = false; 
let manualMicOverride = false; 
let isWakeWordActive = false;

// --- 🚩 1. ระบบจัดการไมโครโฟน ---
function toggleListening(isManual = true) { 
    manualMicOverride = isManual;
    micHardLock = false; 
    window.speechSynthesis.cancel(); 
    if (window.micTimer) clearTimeout(window.micTimer);
    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) { 
        try { window.recognition.stop(); } catch (e) {}
        window.isListening = false;
        if (isManual) manualMicOverride = false; 
        return; 
    } 

    forceStopAllMic(); 
    setTimeout(() => {
        try {
            micHardLock = false; 
            window.recognition.start(); 
        } catch (e) { window.isListening = false; }
    }, 200); 
}

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    if (manualMicOverride) { micHardLock = false; } 
    else if (window.isBusy) { micHardLock = true; }
}

// --- 🚩 2. ระบบดักฟังชื่อ (Wake Word) ---
function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        if (!window.allowWakeWord || window.isBusy || window.isListening) return;
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            isWakeWordActive = false; 
            forceStopAllMic();        
            window.isBusy = true;     
            let msg = window.currentLang === 'th' ? "ครับผม มีอะไรให้ช่วยไหมครับ?" : "Yes! How can I help you?";
            displayResponse(msg);
            setTimeout(() => { speak(msg, () => { toggleListening(false); }); }, 300); 
        }
    };

    wakeWordRecognition.onend = () => {
        if (manualMicOverride || micHardLock) return;
        if (!isAtHome && personInFrameTime !== null && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => { try { wakeWordRecognition.start(); } catch(e) {} }, 1500); 
        }
    };
}

function startWakeWord() {
    if (manualMicOverride || window.isBusy || window.isListening) return;
    if (!window.allowWakeWord || isAtHome || window.isMuted) { isWakeWordActive = false; return; }
    forceStopAllMic();
    setTimeout(() => {
        if (!manualMicOverride && !window.isBusy) {
            micHardLock = false; isWakeWordActive = true; 
            try { wakeWordRecognition.start(); } catch(e) {}
        }
    }, 200);
}

// --- 🚩 3. ระบบเสียงพูดและคำตอบ ---
function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true; 

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH'; msg.rate = 1.05;
    msg.onstart = () => { updateLottie('talking'); };
    msg.onend = () => { 
        window.isBusy = false; updateLottie('idle'); 
        if (callback) { callback(); return; }
        if (!isAtHome) {
            setTimeout(() => {
                if (window.isBusy || manualMicOverride) return;
                if (isGreeting) { window.allowWakeWord = true; startWakeWord(); } 
                else { toggleListening(false); }
            }, 2000); 
        }
    };
    window.speechSynthesis.speak(msg);
}

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    isAtHome = false; updateInteractionTime(); window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
    
    // Logic คัดกรองใบขับขี่
    if ((query.includes("ใบขับขี่") || query.includes("license")) && (query.includes("ต่อ") || query.includes("renew")) && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        const askMsg = (window.currentLang === 'th') ? "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is it Temporary or 5-year?";
        displayResponse(askMsg); speak(askMsg);
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
            { th: "แบบ 5 ปี", en: "5-year type", action: () => startLicenseCheck("แบบ 5 ปี") }
        ]);
        return;
    }

    // ค้นหาในฐานข้อมูล
    let bestMatch = { answer: "", score: 0 };
    for (const sheetName of Object.keys(window.localDatabase)) {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
        window.localDatabase[sheetName].forEach(item => {
            const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
            const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
            let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
            for (const key of keyList) {
                if (!key) continue;
                let score = (query === key) ? 10.0 : calculateSimilarity(query, key) * 5;
                if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
            }
        });
    }
    if (bestMatch.score >= 0.45) { displayResponse(bestMatch.answer); speak(bestMatch.answer); } 
    else { speak(window.currentLang === 'th' ? "ขออภัยครับ ไม่พบข้อมูล" : "No info found."); }
}

// --- 🚩 4. ระบบเช็กใบขับขี่และปุ่มตัวเลือก ---
function startLicenseCheck(type) {
    forceStopAllMic();
    const msg = window.currentLang === 'th' ? `ใบขับขี่ ${type} หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    displayResponse(msg); speak(msg);
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ เกิน 1 ปี (ไม่เกิน 3 ปี)", action: () => showLicenseChecklist(type, 'over1') },
        { th: "❌ เกิน 3 ปี", action: () => showLicenseChecklist(type, 'over3') }
    ]);
}

function showLicenseChecklist(type, expiry) {
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = (expiry === 'normal') ? "ต่อได้ทันที" : "ต้องสอบข้อเขียนใหม่";
    let checklistHTML = `<div class="checklist-card"><strong>${type}</strong><br><small>${note}</small><hr>`;
    docs.forEach((d, i) => {
        checklistHTML += `<div class="check-item"><input type="checkbox" class="doc-check" id="chk-${i}" onchange="checkChecklist()"><label for="chk-${i}">${d}</label></div>`;
    });
    checklistHTML += `<button id="btnPrintGuide" style="display:none;" onclick="alert('กำลังสั่งพิมพ์...'); resetToHome();">🖨️ ปริ้นใบนำทาง</button></div>`;
    displayResponse(checklistHTML);
    speak("กรุณาติ๊กเอกสารให้ครบเพื่อพิมพ์ใบนำทางครับ");
}

function checkChecklist() {
    const checks = document.querySelectorAll('.doc-check');
    const btn = document.getElementById('btnPrintGuide');
    if (btn) btn.style.display = Array.from(checks).every(c => c.checked) ? 'block' : 'none';
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return; container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button'); btn.className = 'faq-btn';
        btn.innerText = window.currentLang === 'th' ? opt.th : opt.en;
        btn.onclick = opt.action;
        container.appendChild(btn);
    });
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach(row => {
        const btn = document.createElement('button'); btn.className = 'faq-btn';
        btn.innerText = row[0];
        btn.onclick = () => getResponse(row[0]);
        container.appendChild(btn);
    });
}

// --- 🚩 5. การตั้งค่าระบบ (Initialization) ---
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            const splash = document.getElementById('splash-screen');
            if (splash) { splash.style.opacity = '0'; setTimeout(() => { splash.style.display = 'none'; initCamera(); renderFAQButtons(); }, 800); }
        }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

function initSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    window.recognition = new Recognition();
    window.recognition.lang = 'th-TH'; window.recognition.continuous = true;
    window.recognition.onstart = () => { window.isListening = true; document.getElementById('micBtn')?.classList.add('recording'); };
    window.recognition.onresult = (e) => {
        let t = ""; for (let i = 0; i < e.results.length; ++i) { t += e.results[i][0].transcript; }
        document.getElementById('userInput').value = t;
        if (window.micTimer) clearTimeout(window.micTimer);
        window.micTimer = setTimeout(() => { if (t) { window.recognition.stop(); getResponse(t); document.getElementById('userInput').value = ""; } }, 2500);
    };
    window.recognition.onend = () => { window.isListening = false; document.getElementById('micBtn')?.classList.remove('recording'); };
}

// --- 🚩 6. AI Detection & Helpers ---
async function initCamera() {
    video = document.getElementById('video');
    try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        if (video) { video.srcObject = s; video.play(); loadFaceModels(); }
    } catch (e) {}
}

async function loadFaceModels() {
    const URL = 'https://taiyang12300.github.io/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(URL);
    await faceapi.nets.ageGenderNet.loadFromUri(URL);
    setupWakeWord(); requestAnimationFrame(detectPerson);
}

async function detectPerson() {
    if (!video || !isDetecting) return;
    const now = Date.now();
    if (now - lastDetectionTime > DETECTION_INTERVAL) {
        lastDetectionTime = now;
        const preds = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = preds.find(f => f.detection.score > 0.5);
        if (face) {
            if (!personInFrameTime) personInFrameTime = now;
            window.detectedGender = face.gender;
            if (now - personInFrameTime > 2000 && isAtHome && !window.isBusy && !window.hasGreeted) greetUser();
            lastSeenTime = now;
        } else if (now - lastSeenTime > 5000) { personInFrameTime = null; window.hasGreeted = false; forceStopAllMic(); }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    isAtHome = false; window.hasGreeted = true; window.isBusy = true;
    let g = window.detectedGender === 'female' ? 'คุณผู้หญิง' : 'คุณผู้ชาย';
    let msg = `สวัสดีครับ ${g} มีอะไรให้น้องนำทางช่วยไหมครับ?`;
    displayResponse(msg); speak(msg, null, true);
}

function resetToHome() {
    isAtHome = true; window.isBusy = false; window.hasGreeted = false;
    displayResponse("กดปุ่มไมค์เพื่อเริ่มถามได้เลยครับ"); renderFAQButtons();
}

function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); } }
function calculateSimilarity(s1, s2) { 
    let longer = s1.length > s2.length ? s1 : s2; let shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}
function editDistance(s1, s2) {
    let costs = []; for (let i = 0; i <= s1.length; i++) {
        let lastValue = i; for (let j = 0; j <= s2.length; j++) {
            if (i === 0) costs[j] = j; else if (j > 0) {
                let newVal = costs[j - 1]; if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue; lastValue = newVal;
            }
        } if (i > 0) costs[s2.length] = lastValue;
    } return costs[s2.length];
}
function updateLottie(s) {
    const p = document.getElementById('lottie-canvas');
    const a = { 'idle': 'https://lottie.host/568e8594-a319-4491-bf10-a0f5c012fc76/6S3urqybG5.json', 'thinking': 'https://lottie.host/e742c203-f211-4521-a5aa-96cd5248d4b8/CKCd2cqmGj.json', 'talking': 'https://lottie.host/79a24a65-7d74-4ff7-8ac5-bb3eeaa49073/4BES9eWBuE.json' };
    if (p) p.load(a[s]);
}
function displayResponse(t) { const e = document.getElementById('response-text'); if (e) e.innerHTML = t.replace(/\n/g, '<br>'); }

// --- 🚩 7. Event Listeners ---
document.addEventListener('DOMContentLoaded', initDatabase);
document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);
