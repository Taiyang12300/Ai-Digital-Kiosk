/**
 * 🚀 สมองกลน้องนำทาง - เวอร์ชั่นตาสับปะรด (อัปเกรดจากโครง COCO)
 * ปรับปรุง: ใช้ Face-API จับใบหน้าแทน COCO เพื่อความแม่นยำและแยกเพศ
 * จูนพิเศษ: รองรับค่าความมั่นใจ 55% และระยะหน้า 120px ตามที่พี่ทดสอบจริง
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

/**
 * 1. ระบบจัดการสถานะและความเสถียร
 */
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

window.switchLanguage = function(lang) {
    resetSystemState(); 
    window.currentLang = lang;
    const welcomeMsg = (lang === 'th') ? "เปลี่ยนเป็นภาษาไทยแล้วครับ" : "Switched to English.";
    displayResponse(welcomeMsg);
    renderFAQButtons(); 
    isAtHome = false; 
    updateInteractionTime();
};

function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.classList.remove('muted');
}

/**
 * 2. ระบบ Reset หน้าจอ
 */
function resetToHome() {
    const now = Date.now();
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer(); 
        return;
    }
    if (isAtHome) return; 

    console.log("🏠 [Action] Returning to Home Screen.");
    resetSystemState();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       
    isAtHome = true; 

    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); 
}

/**
 * 3. ระบบดวงตา AI (Face-API)
 */
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => { 
                video.play(); 
                loadAndStartDetection();
            };
        }
    } catch (err) { console.error("❌ Camera Error:", err); }
}

async function loadAndStartDetection() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/'; 
    try {
        console.log("🧠 [AI] กำลังโหลดโมเดล Face-API...");
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        console.log("✅ [AI] ระบบพร้อมตรวจจับใบหน้า");
        requestAnimationFrame(detectPerson);
    } catch (e) {
        console.error("❌ Model Load Error:", e);
    }
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !faceapi.nets.tinyFaceDetector.isLoaded) { 
        setTimeout(() => requestAnimationFrame(detectPerson), 1000); 
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
        const score = f.detection.score;
        const centerX = box.x + (box.width / 2);
        // จูนตามที่พี่ทดสอบ: มั่นใจ > 55% (กันแกว่ง), กว้าง > 120 (ระยะนั่งทำงาน), อยู่กลางจอ
        return score > 0.55 && box.width > 120 && (centerX > 100 && centerX < 540);
    });

    if (face) {
        if (personInFrameTime === null) {
            console.log("👁️ [AI] เจอใบหน้าในระยะที่กำหนด");
            personInFrameTime = now;
            window.detectedGender = face.gender; // เก็บเพศไว้ใช้ทักทาย
        }

        window.PersonInFrame = true;
        const stayDuration = now - personInFrameTime;

        // ถ้ายืนนิ่งเกิน 1.5 วินาที และอยู่หน้า Home ให้ทักทาย
        if (stayDuration >= 1500 && isAtHome && !window.isBusy && !window.hasGreeted) {
            console.log("👋 [AI] กำลังสั่งทักทาย...");
            greetUser(); 
        }
        lastSeenTime = now; 

    } else {
        const gap = now - lastSeenTime;
        if (personInFrameTime !== null && gap >= 2500) {
            console.log("🚫 [AI] ไม่พบเป้าหมายในระยะ");
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
    const gender = window.detectedGender;

    let timeGreet = "";
    if (isThai) {
        timeGreet = (hour < 12) ? "สวัสดีตอนเช้าครับ" : (hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ");
    } else {
        timeGreet = (hour < 12) ? "Good morning" : (hour < 17 ? "Good afternoon" : "Good evening");
    }

    let personType = "";
    if (isThai) {
        personType = (gender === 'male') ? "คุณผู้ชาย" : "คุณผู้หญิง";
    } else {
        personType = (gender === 'male') ? "Sir" : "Madam";
    }

    const greetings = {
        th: [
            `${timeGreet}${personType} มีอะไรให้น้องนำทางช่วยดูแลไหมครับ?`,
            `ยินดีต้อนรับครับ${personType} สำนักงานขนส่งพยัคฆภูมิพิสัยยินดีให้บริการครับ`,
            `${timeGreet}ครับ เชิญ${personType}สอบถามข้อมูลกับผมได้เลยครับ`,
            `สวัสดีครับ ผมน้องนำทาง มีอะไรให้ช่วยไหมครับ${personType}?`
        ],
        en: [
            `${timeGreet}, ${personType}! How can I assist you today?`,
            `Welcome! How can I help you, ${personType}?`
        ]
    };
    
    const list = greetings[window.currentLang] || greetings['th'];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    
    window.hasGreeted = true; 
    displayResponse(finalGreet);
    speak(finalGreet);
}

/**
 * 4. ระบบประมวลผลคำตอบ (Log & Search) - คงเดิมจาก COCO
 */
async function logQuestionToSheet(userQuery) {
    if (!userQuery || !GAS_URL) return;
    try {
        const finalUrl = `${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`;
        await fetch(finalUrl, { mode: 'no-cors' });
        console.log("📊 [Log] บันทึกสถิติคำถามเรียบร้อย");
    } catch (e) { console.error("❌ [Log] Error:", e); }
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

    const isLicense = query.includes("ใบขับขี่") || query.includes("license");
    const isRenew = query.includes("ต่อ") || query.includes("renew");

    if (isLicense && isRenew && !query.includes("ชั่วคราว") && !query.includes("temporary") && !query.includes("5 ปี") && !query.includes("5ปี")) {
        const askMsg = (window.currentLang === 'th') ? "ไม่ทราบว่าใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is your license Temporary or 5-year type?";
        displayResponse(askMsg);
        speak(askMsg);
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary", s_th: "ต่อใบขับขี่ชั่วคราว", s_en: "renew temporary license" },
            { th: "แบบ 5 ปี", en: "5-year type", s_th: "ต่อใบขับขี่ 5 ปี", s_en: "renew 5 year license" },
        ]);
        window.isBusy = false; 
        return; 
    }

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            const rows = window.localDatabase[sheetName];
            for (const item of rows) {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) continue;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                
                for (const key of keyList) {
                    let score = (query === key) ? 10 : calculateSimilarity(query, key) * 5;
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                }
            }
        }
        if (bestMatch.score >= 0.4 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else {
            const fallback = window.currentLang === 'th' ? "ขออภัยครับ ลองเลือกหัวข้อด้านล่างนะครับ" : "Please try the topics below.";
            displayResponse(fallback);
            speak(fallback);
            renderFAQButtons(); 
        }
    } catch (err) { console.error(err); resetSystemState(); }
}

/**
 * 5. ระบบเสียง - คงเดิมจาก COCO
 */
function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    forceUnmute();
    const safetyTime = (text.length * 200) + 5000;
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    speechSafetyTimeout = setTimeout(() => { if (window.isBusy) { window.isBusy = false; updateLottie('idle'); restartIdleTimer(); } }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout); window.isBusy = false; updateLottie('idle'); updateInteractionTime(); };
    window.speechSynthesis.speak(msg);
}

const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    updateLottie('idle');
};

/**
 * 6. ระบบเริ่มต้นและ UI - คงเดิมจาก COCO
 */
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            renderFAQButtons();
            initCamera(); 
            displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
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
        btn.onclick = () => {
            stopAllSpeech();
            const query = (window.currentLang === 'th') ? opt.s_th : opt.s_en;
            getResponse(query); 
            setTimeout(renderFAQButtons, 800); 
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
