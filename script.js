/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Full Version
 * ระบบ: คัดกรองใบขับขี่ + ปริ้นใบนำทาง + Fuzzy Search + Time-Based Greeting
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
const IDLE_TIME_LIMIT = 15000; 
let video = document.getElementById('video');
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

// --- 1. ระบบจัดการสถานะ & Reset ---
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

function resetToHome() {
    const now = Date.now();
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer(); 
        return;
    }
    if (isAtHome) return; 

    stopAllSpeech();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       
    isAtHome = true; 

    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
    console.log("🔄 [HOME] ระบบ Reset กลับหน้าหลักเรียบร้อย");
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!isAtHome) {
        console.log(`⏲️ [IDLE] เริ่มนับถอยหลังกลับหน้าแรก (${IDLE_TIME_LIMIT/1000}s)`);
        idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); 
    }
}

// --- 2. ระบบดวงตา AI (Face-API) ---
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
    console.log("--- ⏳ เริ่มต้นโหลดโมเดล AI ---");
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        console.log("✅ โหลดโมเดล AI สำเร็จ");
        requestAnimationFrame(detectPerson);
    } catch (err) { console.error("❌ โหลดโมเดลไม่สำเร็จ:", err); }
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined') { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;

    const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
    
    if (predictions.length > 0) {
        const f = predictions[0];
        const box = f.detection.box;
        const cx = Math.round(box.x + (box.width / 2));
        const conf = Math.round(f.detection.score * 100);
        if (conf > 40) console.log(`👤 ตรวจพบ: W=${Math.round(box.width)}, CX=${cx}, CONF=${conf}%`);
    }

    const face = predictions.find(f => {
        const box = f.detection.box;
        const centerX = box.x + (box.width / 2);
        return f.detection.score > 0.55 && box.width > 90 && (centerX > 80 && centerX < 560);
    });

    if (face) {
        if (personInFrameTime === null) {
            console.log("🎯 เป้าหมายเข้าเกณฑ์: เริ่มนับวินาทีสะสม");
            personInFrameTime = now;
        }
        window.detectedGender = face.gender; 
        const stayDuration = now - personInFrameTime;
        if (stayDuration >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) {
            console.log("👋 ครบ 2 วินาที: น้องเริ่มทักทาย");
            greetUser(); 
        }
        lastSeenTime = now; 
    } else {
        if (personInFrameTime !== null && (now - lastSeenTime > 3000)) {
            console.log("🚫 หายไปเกิน 3 วิ: Reset สถานะคนออกจากเฟรม");
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
    
    const hour = new Date().getHours();
    const isThai = window.currentLang === 'th';
    const gender = window.detectedGender || 'male';

    let timeGreet = isThai 
        ? (hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ"))
        : (hour < 12 ? "Good morning" : (hour < 17 ? "Good afternoon" : "Good evening"));

    let personType = isThai 
        ? (gender === 'male' ? "คุณผู้ชาย" : "คุณผู้หญิง")
        : (gender === 'male' ? "Sir" : "Madam");

    const text = isThai 
        ? `${timeGreet}${personType} มีอะไรให้น้องนำทางช่วยดูแลไหมครับ?` 
        : `${timeGreet}, ${personType}! How can I help you today?`;

    window.hasGreeted = true; 
    displayResponse(text);
    speak(text);
}

// --- 3. 🚩 ระบบคัดกรองใบขับขี่ ---
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

    if (isTemp) {
        if (expiry === 'normal') note = "ไม่ต้องอบรม ต่อได้ทันที";
        else if (expiry === 'over1') note = "ไม่ต้องอบรม แต่ต้องสอบข้อเขียนใหม่";
        else if (expiry === 'over3') note = "อบรมสำนักงาน ต้องสอบข้อเขียนและสอบขับรถใหม่";
    } else {
        if (expiry === 'normal') { docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); note = "อบรมออนไลน์ 1 ชม. และต่อได้ทันที"; }
        else if (expiry === 'over1') { docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); note = "อบรมออนไลน์ 2 ชม. และต้องสอบข้อเขียนใหม่"; }
        else if (expiry === 'over3') { note = "ต้องอบรม 5 ชม. ที่ขนส่งเท่านั้น + สอบข้อเขียน + สอบขับรถ"; }
    }

    let checklistHTML = "";
    docs.forEach((d, idx) => {
        checklistHTML += `<div class="check-item" onclick="document.getElementById('chk-${idx}').click()">
            <input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" onclick="event.stopPropagation()">
            <label>${d}</label></div>`;
    });

    const resultHTML = `
        <div class="checklist-card">
            <strong style="font-size:22px;">${type}</strong><br>
            <div style="background:#e8f0fe; color:#1a73e8; padding:8px; border-radius:5px; margin-top:5px; font-weight:bold;">💡 ${note}</div>
            <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
            <p style="font-size:15px; color:#666; margin-bottom:10px;">กรุณาติ๊กตรวจสอบเอกสารให้ครบเพื่อปริ้นใบนำทาง:</p>
            ${checklistHTML}
            <button id="btnPrintGuide" style="display:none;" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}')">🖨️ ปริ้นใบนำทาง</button>
        </div>`;
    displayResponse(resultHTML);
    speak(isThai ? "กรุณาติ๊กตรวจสอบเอกสารให้ครบ เพื่อปริ้นใบนำทางครับ" : "Please check all items to print.");
}

function checkChecklist() {
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    printBtn.style.display = allChecked ? 'block' : 'none';
}

// --- 4. ระบบ Search (Fuzzy Matching) ---
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
            const askMsg = (window.currentLang === 'th') ? "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is it Temporary or 5-year?";
            displayResponse(askMsg); speak(askMsg);
            renderOptionButtons([
                { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
                { th: "แบบ 5 ปี", en: "5-year type", action: () => startLicenseCheck("แบบ 5 ปี") }
            ]);
            window.isBusy = false; return;
        }
    }

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const key = item[0] ? item[0].toString().toLowerCase() : "";
                let currentScore = key.includes(query) ? 10 : calculateSimilarity(query, key) * 10;
                if (currentScore > 6 && currentScore > bestMatch.score) {
                    bestMatch = { answer: (window.currentLang === 'th' ? item[1] : item[2] || item[1]), score: currentScore };
                }
            });
        }
        if (bestMatch.score > 0) { displayResponse(bestMatch.answer); speak(bestMatch.answer); }
        else { 
            const fb = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ" : "No info found."; 
            displayResponse(fb); speak(fb); setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { window.isBusy = false; }
}

// --- 5. ระบบเสียง & UI ---
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

function stopAllSpeech() { window.speechSynthesis.cancel(); window.isBusy = false; updateLottie('idle'); }

function changeLanguage(lang) {
    window.currentLang = lang;
    isAtHome = true;           // แก้บั๊ก: สลับภาษาแล้วน้องกลับมาทักทายใหม่ได้
    window.hasGreeted = false; 
    personInFrameTime = null;
    renderFAQButtons();
    displayResponse(lang === 'th' ? "เลือกภาษาเรียบร้อยครับ" : "Language changed.");
    console.log(`🌐 สลับเป็นภาษา: ${lang} และรีเซ็ตสถานะหน้าหลัก`);
}

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
    if (!container) return; container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.style.border = "2px solid #6c5ce7";
        btn.innerText = (window.currentLang === 'th') ? opt.th : opt.en;
        btn.onclick = () => { stopAllSpeech(); if (opt.action) opt.action(); };
        container.appendChild(btn);
    });
}

function calculateSimilarity(s1, s2) {
    let longer = s1.length < s2.length ? s2 : s1;
    let shorter = s1.length < s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1, s2) {
    let costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newVal = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue; lastValue = newVal;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
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

function displayResponse(text) { document.getElementById('response-text').innerHTML = text.replace(/\n/g, '<br>'); }

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            renderFAQButtons(); initCamera();
            displayResponse("สวัสดีครับ ระบบพร้อมให้บริการแล้ว");
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

initDatabase();
