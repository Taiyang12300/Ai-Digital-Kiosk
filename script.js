/**
 * 🚀 สมองกลน้องนำทาง - เวอร์ชั่นคัดกรองใบขับขี่ + ระบบปริ้นใบนำทาง
 * ปรับปรุง: เพิ่ม Logic คัดกรองวันหมดอายุ และเชื่อมต่อระบบ Print 58mm
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

// --- 3. ระบบดวงตา AI (เปลี่ยนเป็น Face-API แต่ใช้ Logic เดิมควบคุม) ---
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

// --- 4. 🚩 ระบบคัดกรองใบขับขี่ (Logic ใหม่ของพี่) ---

function startLicenseCheck(type) {
    isAtHome = false;
    const isThai = window.currentLang === 'th';
    const msg = isThai ? `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    
    displayResponse(msg);
    speak(msg);

    // แสดงปุ่มเลือกสถานะวันหมดอายุ
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / หมดอายุไม่เกิน 1 ปี", en: "Not expired / Under 1 year", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ หมดอายุเกิน 1 ปี (แต่ไม่เกิน 3 ปี)", en: "Expired 1-3 years", action: () => showLicenseChecklist(type, 'over1') },
        { th: "❌ หมดอายุเกิน 3 ปี", en: "Expired over 3 years", action: () => showLicenseChecklist(type, 'over3') }
    ]);
}

function showLicenseChecklist(type, expiry) {
    const isThai = window.currentLang === 'th';
    const isTemp = type.includes("ชั่วคราว") || type.includes("2 ปี");
    
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = "";

    // กฎเหล็กของพี่: ชั่วคราวไม่ต้องอบรม
    if (isTemp) {
        if (expiry === 'normal') {
            note = "ไม่ต้องอบรม ต่อได้ทันที";
        } else if (expiry === 'over1') {
            note = "ไม่ต้องอบรม แต่ต้องสอบข้อเขียนใหม่";
        } else if (expiry === 'over3') {
            note = "ไม่ต้องอบรม แต่ต้องสอบข้อเขียนและสอบขับรถใหม่";
        }
    } else {
        // กรณี 5 ปี เป็น 5 ปี
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

    let resultHTML = `<strong>${type}</strong><br><span style="color:blue;">${note}</span><hr>`;
    docs.forEach(d => { resultHTML += `<div>[ ] ${d}</div>`; });
    resultHTML += `<br><button onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}')" style="width:100%; padding:15px; background:#28a745; color:white; border:none; border-radius:10px; font-weight:bold; font-size:18px;">🖨️ ปริ้นใบนำทาง</button>`;

    displayResponse(resultHTML);
    speak(isThai ? `เตรียมเอกสารตามรายการนี้ และสามารถปริ้นใบนำทางได้เลยครับ` : `Please prepare these documents and print your guide.`);
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

    // เช็ค Keyword ใบขับขี่
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

    // ระบบค้นหาจาก Database ปกติ
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

    // Safety Timeout จากโค้ดเดิม
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

// 🚩 จุดสำคัญ: ใช้รูปแบบ const ตามโค้ดเดิมเป๊ะ
const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    updateLottie('idle');
    console.log("🛑 [Action] Speech Terminated.");
};

// ดักฟังการปิดหน้าจอ
window.addEventListener('pagehide', stopAllSpeech);
window.addEventListener('beforeunload', stopAllSpeech);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopAllSpeech(); });

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
    document.getElementById('response-text').innerHTML = text.replace(/\n/g, '<br>');
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
