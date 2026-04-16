/**
 * 🚀 สมองกลน้องนำทาง - เวอร์ชั่นคัดกรองใบขับขี่ + ระบบปริ้นใบนำทาง
 * ปรับปรุง: เพิ่มระบบ Similarity Search (หาคำเหมือน) + แก้ไข Checklist
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
        window.PersonInFrame = true;
        window.detectedGender = face.gender; 
        if ((now - personInFrameTime) >= 3000 && isAtHome && !window.isBusy && !window.hasGreeted) greetUser(); 
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

// --- 4. 🚩 ระบบคัดกรองใบขับขี่ & Checklist ---

function checkChecklist() {
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    printBtn.style.display = allChecked ? "block" : "none";
}

function startLicenseCheck(type) {
    isAtHome = false;
    const isThai = window.currentLang === 'th';
    const msg = isThai ? `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    displayResponse(msg);
    speak(msg);

    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", en: "Not expired", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ หมดอายุเกิน 1 ปี (ไม่เกิน 3 ปี)", en: "Expired 1-3 years", action: () => showLicenseChecklist(type, 'over1') },
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
        else if (expiry === 'over3') note = "ไม่ต้องอบรม แต่ต้องสอบข้อเขียนและสอบขับรถใหม่";
    } else {
        if (expiry === 'normal') { 
            docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); 
            note = "อบรมออนไลน์ 1 ชม. และต่อได้ทันที"; 
        }
        else if (expiry === 'over1') { 
            docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); 
            note = "อบรมออนไลน์ และต้องสอบข้อเขียนใหม่"; 
        }
        else if (expiry === 'over3') note = "ต้องอบรม 5 ชม. ที่ขนส่งเท่านั้น + สอบข้อเขียน + สอบขับรถ";
    }

    // สร้าง HTML ใหม่ให้สวยงาม
    let resultHTML = `
        <div style="text-align:left; background:#ffffff; border-radius:20px; padding:20px; box-shadow:0 10px 25px rgba(0,0,0,0.05); border:1px solid #f0f0f0;">
            <div style="display:flex; align-items:center; margin-bottom:15px;">
                <div style="background:#6c5ce7; width:5px; height:25px; border-radius:10px; margin-right:10px;"></div>
                <strong style="font-size:22px; color:#2d3436;">${type}</strong>
            </div>
            
            <div style="background:#fff9f0; border-left:4px solid #fab1a0; padding:12px; border-radius:8px; margin-bottom:20px;">
                <span style="color:#e17055; font-weight:bold; font-size:16px;">💡 ${note}</span>
            </div>

            <p style="margin-bottom:15px; font-weight:600; color:#636e72;">รายการที่ต้องเตรียม:</p>
    `;
    
    docs.forEach((d, idx) => {
        resultHTML += `
            <div style="margin-bottom:15px; display:flex; align-items:center; background:#f8f9fa; padding:12px; border-radius:12px; transition: 0.3s;">
                <input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" 
                    style="width:24px; height:24px; cursor:pointer; accent-color:#6c5ce7;">
                <label for="chk-${idx}" style="font-size:18px; margin-left:12px; color:#2d3436; cursor:pointer; flex:1;">${d}</label>
            </div>
        `;
    });

    // ปุ่มปริ้นที่แก้ Syntax แล้ว
    resultHTML += `
            <button id="btnPrintGuide" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}')" 
                style="display:none; width:100%; padding:18px; background:linear-gradient(135deg, #2ecc71, #27ae60); color:white; border:none; border-radius:15px; font-weight:bold; font-size:20px; margin-top:15px; box-shadow:0 5px 15px rgba(46, 204, 113, 0.3); cursor:pointer;">
                🖨️ ปริ้นใบนำทาง
            </button>
        </div>
    `;

    displayResponse(resultHTML);
    speak(isThai ? `ตรวจสอบรายการเอกสาร และกดปริ้นใบนำทางได้เลยครับ` : `Please check your documents and print.`);
}

// --- 5. ระบบค้นหาและจัดการคำถาม (Fuzzy Search) ---

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
            const askMsg = (window.currentLang === 'th') ? "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Temporary or 5-year?";
            displayResponse(askMsg); speak(askMsg);
            renderOptionButtons([
                { th: "แบบชั่วคราว (2 ปี)", en: "Temporary", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
                { th: "แบบ 5 ปี", en: "5-year", action: () => startLicenseCheck("แบบ 5 ปี") }
            ]);
            window.isBusy = false; return;
        }
    }

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const keys = item[0] ? item[0].toString().toLowerCase() : "";
                if (keys === "") return;

                // 1. Partial Match
                if (keys.includes(query) || query.includes(keys)) {
                    bestMatch = { answer: (window.currentLang === 'th' ? item[1] : item[2] || item[1]), score: 10 };
                } 
                // 2. Similarity Match (Fuzzy) - ถ้ายังไม่มีคะแนนที่ดีกว่า
                else if (bestMatch.score < 8) {
                    let sim = calculateSimilarity(query, keys);
                    if (sim > 0.75) { // ความเหมือนเกิน 75%
                        bestMatch = { answer: (window.currentLang === 'th' ? item[1] : item[2] || item[1]), score: sim * 10 };
                    }
                }
            });
        }
        if (bestMatch.score > 0) { displayResponse(bestMatch.answer); speak(bestMatch.answer); }
        else { speak("ขออภัยครับ น้องหาข้อมูลไม่พบ"); setTimeout(renderFAQButtons, 3000); }
    } catch (err) { window.isBusy = false; }
}

// ฟังก์ชันคำนวณความเหมือน
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

// --- 6. ระบบเสียงและ UI ---
function speak(text) {
    if (!text || window.isMuted) return;
    window.speechSynthesis.cancel();
    forceUnmute();
    const safetyTime = (text.length * 200) + 5000;
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    speechSafetyTimeout = setTimeout(() => { if (window.isBusy) { window.isBusy = false; updateLottie('idle'); } }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout); window.isBusy = false; updateLottie('idle'); };
    window.speechSynthesis.speak(msg);
}

const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    window.isBusy = false; updateLottie('idle');
};

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText && qText.toString().trim() !== "") {
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
        btn.onclick = () => { stopAllSpeech(); if (opt.action) opt.action(); };
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
            renderFAQButtons(); initCamera();
            displayResponse("ระบบพร้อมให้บริการแล้วครับ");
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

initDatabase();
