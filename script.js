/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Centralized Switch & Hybrid Features
 * แก้ไข: รวมศูนย์ระบบไมค์ผ่าน switchMicMode และคงฟังก์ชันสำคัญ (Checklist/Print/AI) ไว้ครบถ้วน
 */

// --- 🚩 1. Global Variables ---
window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.isListening = false;
window.micMode = 'none'; // สถานะ: 'none', 'wakeword', 'stt'
window.recognition = null; 

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

let wakeWordRecognition = null;

// --- 🚩 2. ระบบควบคุมไมโครโฟนหนึ่งเดียว (The Master Switch) ---

function switchMicMode(newMode = 'none') {
    console.log(`🔄 [MicSystem] Switching to: ${newMode}`);
    window.micMode = newMode;

    // เคลียร์การทำงานของไมค์ทิ้งทั้งหมดก่อนเริ่ม Mode ใหม่
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }

    // ถ้าติด Busy, Mute หรือสั่งเป็น None ให้หยุดการทำงานทันที
    if (newMode === 'none' || window.isBusy || window.isMuted) {
        updateMicUI(false);
        return;
    }

    // หน่วงเวลาเล็กน้อยเพื่อให้ Hardware เคลียร์สถานะ Release
    setTimeout(() => {
        try {
            if (newMode === 'wakeword' && !isAtHome) {
                wakeWordRecognition.start();
                updateMicUI(false);
            } 
            else if (newMode === 'stt') {
                window.recognition.start();
                updateMicUI(true);
            }
        } catch (e) {
            console.warn("⚠️ Mic Conflict - Retrying...");
            if (window.micMode !== 'none') setTimeout(() => switchMicMode(window.micMode), 600);
        }
    }, 400);
}

function updateMicUI(isActive) {
    window.isListening = isActive;
    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');
    if (micBtn) micBtn.classList.toggle('recording', isActive);
    if (statusText) {
        statusText.innerText = isActive ? "กำลังฟัง..." : "แตะไมค์เพื่อเริ่มพูด";
    }
}

function toggleListening() {
    window.speechSynthesis.cancel();
    // ถ้ากำลังฟังอยู่ให้ปิด (None) ถ้าไม่ฟังให้เปิด (STT)
    if (window.micMode === 'stt') switchMicMode('none');
    else switchMicMode('stt');
}

// --- 🚩 3. ระบบจัดการเสียง (TTS) และการรับคำสั่งต่อเนื่อง ---

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    
    switchMicMode('none'); // ปิดไมค์ขณะพูดเพื่อป้องกัน Loopback
    window.speechSynthesis.cancel();
    window.isBusy = true; 

    let phoneticText = text.replace(/Smart Queue/gi, "สมาร์ท คิว").replace(/DLT/gi, "ดีแอลที");
    const msg = new SpeechSynthesisUtterance(phoneticText.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    
    msg.onstart = () => { updateLottie('talking'); };
    msg.onend = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
        if (callback) callback();

        // หลังจากพูดจบ ให้ตัดสินใจว่าจะเปิดไมค์โหมดไหนต่อ
        if (!isAtHome && personInFrameTime !== null) {
            setTimeout(() => {
                if (window.isBusy) return;
                if (isGreeting) {
                    switchMicMode('wakeword'); // ทักทายเสร็จ รอรับ Wake Word
                } else {
                    switchMicMode('stt'); // ตอบคำถามเสร็จ เปิดไมค์ STT รอรับคำถามต่อทันที
                    if (window.micTimer) clearTimeout(window.micTimer);
                    window.micTimer = setTimeout(() => {
                        // ถ้าผ่านไป 7 วินาทีไม่มีคนพูด ให้กลับไปโหมด Wake Word เพื่อประหยัดทรัพยากร
                        if (window.micMode === 'stt' && !window.isBusy) switchMicMode('wakeword');
                    }, 7000); 
                }
            }, 1500); 
        }
    };
    msg.onerror = () => { window.isBusy = false; updateLottie('idle'); };
    window.speechSynthesis.speak(msg);
}

function stopAllSpeech() { 
    window.speechSynthesis.cancel(); 
    window.isBusy = false; 
    updateLottie('idle'); 
}

// --- 🚩 4. ตั้งค่าระบบไมโครโฟน (Initialization) ---

function initSpeechSystems() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // [STT Instance] สำหรับฟังคำถาม
    window.recognition = new SpeechRecognition();
    window.recognition.lang = 'th-TH';
    window.recognition.continuous = true; 
    window.recognition.interimResults = true; 

    window.recognition.onresult = (e) => {
        if (window.micTimer) clearTimeout(window.micTimer);
        let transcript = Array.from(e.results).map(r => r[0].transcript).join("");
        if (transcript.trim() !== "") {
            const inputField = document.getElementById('userInput');
            if (inputField) inputField.value = transcript;
            window.micTimer = setTimeout(() => {
                const finalQuery = transcript;
                if (inputField) inputField.value = '';
                processQuery(finalQuery);
                switchMicMode('none'); 
            }, 3000);
        }
    };

    // [WakeWord Instance] สำหรับฟัง "น้องนำทาง"
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.lang = 'th-TH';
    wakeWordRecognition.onresult = (event) => {
        if (window.isBusy || window.micMode !== 'wakeword') return;
        let transcript = Array.from(event.results).map(r => r[0].transcript).join("");
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            switchMicMode('none');        
            const msg = "น้องนำทางมาแล้วครับ มีอะไรให้ช่วยไหมครับ?";
            displayResponse(msg);
            setTimeout(() => { speak(msg); }, 300); 
        }
    };
    wakeWordRecognition.onend = () => {
        // ให้เปิด Wake Word ตลอดเวลาถ้าไม่อยู่โหมด Home และอยู่ใน Mode Wakeword
        if (window.micMode === 'wakeword' && personInFrameTime !== null && !window.isBusy) {
            setTimeout(() => { try { if(window.micMode === 'wakeword') wakeWordRecognition.start(); } catch(e) {} }, 1000);
        }
    };
}

// --- 🚩 5. ฟังก์ชันสำคัญ: คัดกรองใบขับขี่ (Checklist & Print) ---

function startLicenseCheck(type) {
    switchMicMode('none');
    isAtHome = false;
    const msg = `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?`;
    displayResponse(msg);
    speak(msg);
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ หมดอายุเกิน 1 ปี (แต่ไม่เกิน 3 ปี)", action: () => showLicenseChecklist(type, 'over1') },
        { th: "❌ หมดอายุเกิน 3 ปี", action: () => showLicenseChecklist(type, 'over3') }
    ]);
}

function showLicenseChecklist(type, expiry) {
    updateInteractionTime();
    const isTemp = type.includes("ชั่วคราว") || type.includes("2 ปี");
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = "";

    if (isTemp) {
        if (expiry === 'normal') note = "ไม่ต้องอบรม ต่อได้ทันที";
        else if (expiry === 'over1') note = "อบรมสำนักงาน 5 ชั่วโมง และสอบข้อเขียนใหม่";
        else if (expiry === 'over3') note = "อบรมสำนักงาน 5 ชั่วโมง สอบข้อเขียนและสอบขับรถใหม่";
    } else {
        if (expiry === 'normal') { docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); note = "อบรมออนไลน์ 1 ชม. และต่อได้ทันที"; }
        else if (expiry === 'over1') { docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); note = "อบรมออนไลน์ 2 ชม. และต้องสอบข้อเขียนใหม่"; }
        else if (expiry === 'over3') { note = "ต้องอบรม 5 ชม. ที่ขนส่งเท่านั้น + สอบข้อเขียน + สอบขับรถ"; }
    }

    let checklistHTML = "";
    docs.forEach((d, idx) => {
        checklistHTML += `<div class="check-item" onclick="document.getElementById('chk-${idx}').click()">
            <input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" onclick="event.stopPropagation()">
            <label>${d}</label>
        </div>`;
    });

    const resultHTML = `
        <div class="checklist-card">
            <strong style="font-size:22px;">${type}</strong><br>
            <div style="background:#e8f0fe; color:#1a73e8; padding:8px; border-radius:5px; margin-top:5px; font-weight:bold;">💡 ${note}</div>
            <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
            ${checklistHTML}
            <button id="btnPrintGuide" style="display:none;" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}'); setTimeout(() => { resetToHome(); }, 2000);">🖨️ ปริ้นใบนำทาง</button>
        </div>`;

    displayResponse(resultHTML);
    speak("กรุณาตรวจสอบเอกสารให้ครบ เพื่อปริ้นใบนำทางครับ");
}

function checkChecklist() {
    updateInteractionTime(); 
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    printBtn.style.display = allChecked ? 'block' : 'none';
}

// --- 🚩 6. ระบบ AI Detector & Home Management ---

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        requestAnimationFrame(detectPerson);
    } catch (err) { console.error("❌ AI Error"); }
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;

    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = predictions.find(f => f.detection.box.width > 90);
        
        if (face) {
            if (personInFrameTime === null) personInFrameTime = now;
            lastSeenTime = now;
            // ถ้าหน้ายังอยู่ในเฟรม แต่ไมค์ปิดอยู่ ให้เปิด Wake Word รอ
            if (window.hasGreeted && !window.isBusy && window.micMode === 'none' && !isAtHome) {
                switchMicMode('wakeword');
            }
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) greetUser();
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
                personInFrameTime = null; 
                resetToHome();
            }
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    window.isMuted = false;
    isAtHome = false; 
    window.hasGreeted = true; 
    const msg = "สวัสดีครับ น้องนำทางยินดีให้บริการ มีอะไรให้ช่วยไหมครับ?";
    displayResponse(msg);
    speak(msg, null, true); 
}

function resetToHome() {
    if (isAtHome) return;
    stopAllSpeech();
    switchMicMode('none');
    window.hasGreeted = false;
    isAtHome = true;
    displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
    renderFAQButtons();
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    if (!isAtHome) {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
    }
}

// --- 🚩 7. Logic การค้นหาคำตอบ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();
    
    if ((query.includes("ต่อ") && query.includes("ใบขับขี่")) && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        const askMsg = "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg); 
        speak(askMsg);
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
            { th: "แบบ 5 ปี", action: () => startLicenseCheck("แบบ 5 ปี") }
        ]);
        return;
    }

    let bestMatch = { answer: "", score: 0 };
    for (const sheetName of Object.keys(window.localDatabase)) {
        if (["FAQ", "Config"].includes(sheetName)) continue;
        window.localDatabase[sheetName].forEach(item => {
            const keys = item[0] ? item[0].toString().toLowerCase().split(/[,|\n]/) : [];
            keys.forEach(k => {
                const score = calculateSimilarity(query, k.trim());
                if (score > bestMatch.score) bestMatch = { answer: item[1], score: score };
            });
        });
    }

    if (bestMatch.score > 0.45) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const noMsg = "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ";
        displayResponse(noMsg);
        speak(noMsg);
    }
}

async function processQuery(query) {
    stopAllSpeech();
    displayResponse("กำลังค้นหา...");
    await getResponse(query);
}

// --- 🚩 8. ฟังก์ชันช่วยงาน (Helpers) ---

function calculateSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    let longer = s1.length > s2.length ? s1 : s2;
    let shorter = s1.length > s2.length ? s2 : s1;
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

function displayResponse(text) { 
    const responseEl = document.getElementById('response-text');
    if (responseEl) responseEl.innerHTML = text.replace(/\n/g, '<br>'); 
}

function updateLottie(state) {
    const player = document.getElementById('lottie-canvas');
    const assets = {
        'idle': 'https://lottie.host/568e8594-a319-4491-bf10-a0f5c012fc76/6S3urqybG5.json',
        'thinking': 'https://lottie.host/e742c203-f211-4521-a5aa-96cd5248d4b8/CKCd2cqmGj.json',
        'talking': 'https://lottie.host/79a24a65-7d74-4ff7-8ac5-bb3eeaa49073/4BES9eWBuE.json'
    };
    if (player && typeof player.load === 'function') player.load(assets[state]);
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = row[0];
        btn.onclick = () => { stopAllSpeech(); getResponse(row[0]); };
        container.appendChild(btn);
    });
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return; container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button'); btn.className = 'faq-btn';
        btn.innerText = opt.th;
        btn.onclick = () => { stopAllSpeech(); if (opt.action) opt.action(); };
        container.appendChild(btn);
    });
}

// --- 🚩 9. การเริ่มต้นระบบ (Initialization) ---

async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            if (progBar) progBar.style.width = '100%';
            setTimeout(completeLoading, 600); 
        }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.transition = 'opacity 0.8s ease';
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            initCamera();       
            initSpeechSystems(); 
            renderFAQButtons();
        }, 800);
    }
}

async function initCamera() {
    video = document.getElementById('video'); 
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (video) { video.srcObject = stream; video.play(); loadFaceModels(); }
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', initDatabase);
