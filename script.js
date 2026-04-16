/**
 * 🚀 สมองกลน้องนำทาง - เวอร์ชั่น Face-API + Checklist System
 * ปรับปรุง: เพิ่มระบบ Checklist ติ๊กครบถึงจะแสดงปุ่มปริ้น
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
    console.log("🧹 [System] Resetting State...");
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

    console.log("🏠 [Action] Returning Home Screen.");
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

// --- 3. ระบบดวงตา AI ---
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
    console.log("✅ [AI] Face-API Ready");
    requestAnimationFrame(detectPerson);
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined') { 
        requestAnimationFrame(detectPerson); 
        return; 
    }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) {
        requestAnimationFrame(detectPerson);
        return;
    }
    lastDetectionTime = now;

    const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
    const face = predictions.find(f => {
        const box = f.detection.box;
        const centerX = box.x + (box.width / 2);
        return f.detection.score > 0.60 && box.width > 160 && (centerX > 100 && centerX < 540);
    });

    if (face) {
        if (personInFrameTime === null) {
            console.log(`👁️ [AI] Spotted: ${face.gender}`);
            personInFrameTime = now;
        }
        window.PersonInFrame = true;
        window.detectedGender = face.gender; 
        const stayDuration = now - personInFrameTime;
        if (stayDuration >= 3000 && isAtHome && !window.isBusy && !window.hasGreeted) {
            greetUser(); 
        }
        lastSeenTime = now; 
    } else {
        if (personInFrameTime !== null && (now - lastSeenTime > 3000)) {
            window.PersonInFrame = false; 
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

    let timeGreet = (hour < 12) ? (isThai ? "สวัสดีตอนเช้าครับ" : "Good morning") :
                    (hour < 17) ? (isThai ? "สวัสดีตอนบ่ายครับ" : "Good afternoon") : 
                                 (isThai ? "สวัสดีตอนเย็นครับ" : "Good evening");

    let personType = isThai ? (gender === 'male' ? "คุณผู้ชาย" : "คุณผู้หญิง") : (gender === 'male' ? "Sir" : "Madam");

    const greetings = {
        th: [`${timeGreet}${personType} มีอะไรให้น้องนำทางช่วยดูแลไหมครับ?`, `สำนักงานขนส่งพยัคฆภูมิพิสัย ยินดีให้บริการครับ มีอะไรให้ช่วยไหมครับ?`],
        en: [`${timeGreet}, ${personType}! How can I assist you?`]
    };
    
    const list = greetings[window.currentLang] || greetings['th'];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    window.hasGreeted = true; 
    displayResponse(finalGreet);
    speak(finalGreet);
}

// --- 4. ระบบ Search และ Checklist Logic ---
async function logQuestionToSheet(userQuery) {
    if (!userQuery || !GAS_URL) return;
    try {
        const finalUrl = `${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`;
        await fetch(finalUrl, { mode: 'no-cors' });
    } catch (e) { console.error(e); }
}

// ฟังก์ชันตรวจสอบการติ๊ก Checklist เพื่อแสดงปุ่มปริ้น
function checkChecklist() {
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    const allChecked = Array.from(checks).every(c => c.checked);
    printBtn.style.display = allChecked ? "block" : "none";
}

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery);

    if (window.isBusy) { stopAllSpeech(); window.isBusy = false; }
    isAtHome = false; 
    updateInteractionTime(); 
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");

    // ดักเงื่อนไขใบขับขี่
    const isLicense = query.includes("ใบขับขี่") || query.includes("license");
    const isRenew = query.includes("ต่อ") || query.includes("renew");

    if (isLicense && isRenew && !query.includes("ชั่วคราว") && !query.includes("5 ปี") && !query.includes("5ปี")) {
        const askMsg = (window.currentLang === 'th') ? "ไม่ทราบว่าใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is your license Temporary or 5-year?";
        displayResponse(askMsg);
        speak(askMsg);
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", s_th: "ต่อใบขับขี่ชั่วคราว", s_en: "renew temporary license" },
            { th: "แบบ 5 ปี", en: "5-year type", s_th: "ต่อใบขับขี่ 5 ปี เป็น 5 ปี", s_en: "renew 5 year license" },
        ]);
        window.isBusy = false; 
        return; 
    }

    try {
        let bestMatch = { answer: "", score: 0, debugKey: "" };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            const rows = window.localDatabase[sheetName];
            for (const item of rows) {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) continue;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? item[1] : (item[2] || item[1]);
                for (const key of keyList) {
                    let score = 0;
                    const lowerKey = key.toLowerCase();
                    if (query === lowerKey) score = 10.0;
                    else {
                        const keyTokens = lowerKey.split(/[\s,/-]+/).filter(t => t.length > 1);
                        let matchCount = 0;
                        keyTokens.forEach(kt => { if (query.includes(kt)) matchCount++; });
                        score = (matchCount / (keyTokens.length || 1)) * 5 + calculateSimilarity(query, lowerKey);
                    }
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score, debugKey: lowerKey };
                }
            }
        }

        if (bestMatch.score >= 0.4 && bestMatch.answer !== "") {
            // ระบบตรวจสอบว่าเป็นข้อมูลที่มีรายการเอกสาร (\n) หรือไม่
            if (bestMatch.answer.includes('\\n')) {
                const parts = bestMatch.answer.split('|'); // รูปแบบข้อมูล: หัวข้อ|หมายเหตุ|รายการเอกสาร
                if (parts.length >= 3) {
                    const type = parts[0];
                    const note = parts[1];
                    const docs = parts[2];
                    
                    let html = `<div style="text-align:left; border:2px solid #6c5ce7; padding:15px; border-radius:15px; background:#fff;">`;
                    html += `<strong style="font-size:20px; color:#6c5ce7;">${type}</strong><br>`;
                    html += `<span style="color:#e67e22; font-weight:bold;">💡 ${note}</span><hr style="border:0.5px dashed #6c5ce7; margin:15px 0;">`;
                    html += `<p style="margin-bottom:10px; font-weight:bold;">กรุณาติ๊กตรวจสอบเอกสารให้ครบ:</p>`;
                    
                    docs.split('\\n').forEach((d, idx) => {
                        html += `<div style="margin-bottom:12px; display:flex; align-items:center; gap:10px;">
                                   <input type="checkbox" class="doc-check" id="d-${idx}" onchange="checkChecklist()" style="width:22px; height:22px;">
                                   <label for="d-${idx}" style="font-size:18px;">${d}</label>
                                 </div>`;
                    });
                    
                    html += `<button id="btnPrintGuide" onclick="printLicenseNote('${type}', '${note}', '${docs}')" 
                              style="display:none; width:100%; padding:15px; background:#27ae60; color:white; border:none; border-radius:10px; font-weight:bold; font-size:18px; margin-top:10px; cursor:pointer;">
                              🖨️ ปริ้นใบนำทาง</button></div>`;
                    
                    displayResponse(html);
                    speak(window.currentLang === 'th' ? "ตรวจสอบเอกสารและติ๊กให้ครบเพื่อปริ้นครับ" : "Please check all documents to print.");
                } else {
                    displayResponse(bestMatch.answer);
                    speak(bestMatch.answer);
                }
            } else {
                displayResponse(bestMatch.answer);
                speak(bestMatch.answer);
            }
        } else {
            const fb = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ" : "No info found.";
            displayResponse(fb);
            speak(fb);
            renderFAQButtons();
        }
    } catch (err) { console.error(err); resetSystemState(); }
}

// --- 5. ระบบเสียง ---
function speak(text) {
    if (!text || window.isMuted) return;
    window.speechSynthesis.cancel();
    forceUnmute();

    const safetyTime = (text.length * 200) + 5000;
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    speechSafetyTimeout = setTimeout(() => {
        if (window.isBusy) { window.isBusy = false; updateLottie('idle'); restartIdleTimer(); }
    }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { 
        if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
        window.isBusy = false; updateLottie('idle'); updateInteractionTime(); 
    };
    window.speechSynthesis.speak(msg);
}

const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    updateLottie('idle');
    console.log("🛑 [Action] Speech Terminated.");
};

window.addEventListener('pagehide', stopAllSpeech);
window.addEventListener('beforeunload', stopAllSpeech);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopAllSpeech(); });

// --- 6. ระบบ UI ---
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            renderFAQButtons();
            initCamera(); 
            displayResponse("ระบบพร้อมให้บริการแล้วครับ");
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
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
    if (!container) return;
    container.innerHTML = ""; 
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn'; 
        btn.style.border = "2px solid #6366f1"; 
        btn.innerText = (window.currentLang === 'th') ? opt.th : opt.en; 
        btn.onclick = () => { stopAllSpeech(); getResponse((window.currentLang === 'th') ? opt.s_th : opt.s_en); setTimeout(renderFAQButtons, 800); };
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
    const box = document.getElementById('response-text');
    if (box) box.innerHTML = text.replace(/\n/g, '<br>');
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

initDatabase();
