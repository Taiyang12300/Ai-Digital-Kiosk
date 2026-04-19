/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version 2026
 * สถานะ: พูดจบเปิดไมค์รออัตโนมัติ 7 วินาที (Continuous Listening)
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
let speechSafetyTimeout = null;
const IDLE_TIME_LIMIT = 5000; 
let video; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

let wakeWordRecognition;
let isWakeWordActive = false;
let autoListenTimeout = null; 

// --- 0. ฟังก์ชันควบคุม Splash Screen & Initial Home ---

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    const progBar = document.getElementById('splash-progress-bar');
    const statusTxt = document.getElementById('splash-status-text');
    const responseEl = document.getElementById('response-text');

    if (progBar) progBar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = 'ระบบพร้อมใช้งาน';
    
    setTimeout(() => {
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                isAtHome = true;
                window.isBusy = false;
                window.hasGreeted = false;
                if (responseEl) responseEl.innerText = "สวัสดีครับ มีอะไรให้น้องนำทางช่วยไหมครับ?";
                renderFAQButtons(); 
                initCamera();       
            }, 500);
        }
    }, 400); 
}

// --- 1. ระบบจัดการสิทธิ์ ไมโครโฟน และเสียง ---

function forceStopAllMic() {
    isWakeWordActive = false;
    if (autoListenTimeout) clearTimeout(autoListenTimeout);
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    console.log("🛑 [System] All Microphones Released.");
}

function stopAllSpeech() { 
    window.speechSynthesis.cancel(); 
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout); 
    window.isBusy = false; 
    updateLottie('idle'); 
}

function speak(text, callback = null) {
    if (!text || window.isMuted) return;
    
    isWakeWordActive = false; 
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true;

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    
    msg.onstart = () => { updateLottie('talking'); };
    
    msg.onend = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
        if (callback) {
            callback();
        } else {
            // 🚩 พูดจบปุ๊บ เปิดไมค์รอฟังทันที (ยกเว้นอยู่หน้าโฮม)
            if (!isAtHome) {
                setTimeout(() => { startContinuousListening(); }, 800); 
            }
        }
    };
    window.speechSynthesis.speak(msg);
}

function startContinuousListening() {
    if (window.isBusy || isAtHome) return;
    console.log("🎤 [System] Auto-listening started...");
    
    if (typeof toggleListening === "function") {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (!isListeningNow) toggleListening(); 
    }

    if (autoListenTimeout) clearTimeout(autoListenTimeout);
    autoListenTimeout = setTimeout(() => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (isListeningNow) {
            console.log("⏳ [System] No input, closing mic.");
            toggleListening(); 
            if (window.allowWakeWord) startWakeWord(); 
        }
    }, 7000); // รอ 7 วินาที
}

// --- 2. Wake Word & Presence Logic ---

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (!window.allowWakeWord || window.isBusy || isListeningNow) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            console.log("🎯 Keyword Matched!");
            forceStopAllMic(); 
            window.isBusy = true;

            const affirmations = ["ครับผม", "สวัสดีครับ", "น้องนำทางมาแล้วครับ"];
            const questions = ["มีอะไรให้น้องช่วยไหมครับ?", "สอบถามข้อมูลได้เลยนะครับ"];
            const msg = `${affirmations[Math.floor(Math.random() * affirmations.length)]}... ${questions[Math.floor(Math.random() * questions.length)]}`;
            
            displayResponse(msg);
            speak(msg);
        }
    };

    wakeWordRecognition.onend = () => {
        if (window.allowWakeWord && isWakeWordActive && !window.isBusy && !isListening && personInFrameTime !== null) {
            setTimeout(() => {
                try { if (!window.isBusy) wakeWordRecognition.start(); } catch(e) {}
            }, 500);
        }
    };
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
    if (!window.allowWakeWord || isAtHome || isListeningNow || window.isMuted || window.isBusy) {
        isWakeWordActive = false;
        return;
    }
    try { 
        isWakeWordActive = true; 
        wakeWordRecognition.start(); 
    } catch (e) {}
}

// --- 3. ระบบประมวลผลคำตอบ (Core Logic) ---

async function getResponse(userQuery) {
    if (autoListenTimeout) clearTimeout(autoListenTimeout); // หยุดจับเวลาปิดไมค์เมื่อได้ยินเสียง
    if (!userQuery || !window.localDatabase) return;
    
    logQuestionToSheet(userQuery); 
    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");

    // เช็คกรณีใบขับขี่
    const isLicense = query.includes("ใบขับขี่") || query.includes("license");
    const isRenew = query.includes("ต่อ") || query.includes("renew");

    if (isLicense && isRenew && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        const askMsg = "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg); 
        speak(askMsg);
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", s_th: "ต่อใบขับขี่ชั่วคราว" },
            { th: "แบบ 5 ปี", s_th: "ต่อใบขับขี่ 5 ปี เป็น 5 ปี" }
        ]);
        return;
    }

    // ระบบค้นหาใน Database
    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) return;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                
                keyList.forEach(key => {
                    let score = calculateSimilarity(query, key);
                    if (query.includes(key) || key.includes(query)) score += 0.5;
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                });
            });
        }

        if (bestMatch.score >= 0.45) { 
            displayResponse(bestMatch.answer); 
            speak(bestMatch.answer); 
        } else { 
            const noDataMsg = "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ";
            displayResponse(noDataMsg); 
            speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { window.isBusy = false; }
}

// --- 4. การจัดการ UI และอื่นๆ (Helper Functions) ---

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText;
            btn.onclick = () => { getResponse(qText); };
            container.appendChild(btn);
        }
    });
}

function displayResponse(text) { 
    const responseEl = document.getElementById('response-text');
    if (responseEl) responseEl.innerHTML = text.replace(/\n/g, '<br>'); 
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

// --- 5. การตรวจจับใบหน้า & กล้อง ---

async function detectPerson() {
    if (!isDetecting || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = predictions.find(f => f.detection.score > 0.55 && f.detection.box.width > 90);
        
        if (face) {
            if (personInFrameTime === null) personInFrameTime = now;
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) { greetUser(); }
            lastSeenTime = now; 
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
                personInFrameTime = null; window.hasGreeted = false; window.allowWakeWord = false; forceStopAllMic(); 
                if (!isAtHome) restartIdleTimer();
            }
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

// --- 6. Initializers ---

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            completeLoading();
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (video) { 
            video.srcObject = stream; 
            video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; 
        }
    } catch (err) { console.error("❌ Camera Error"); }
}

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
    setupWakeWord(); 
    requestAnimationFrame(detectPerson);
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

document.addEventListener('DOMContentLoaded', initDatabase);
