/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Fixed & Optimized)
 * แก้ไข: ปุ่มกดไม่ไป, ตัวหนังสือพิมพ์ซ้ำ, และระบบ Auto-Mic หลังพูดจบ
 */

// --- 1. Constants & Global State ---
const STATUS = {
    IDLE: 'IDLE',           // พักการทำงาน
    LISTENING: 'LISTENING', // กำลังฟังเสียง
    THINKING: 'THINKING',   // กำลังประมวลผลข้อมูล
    SPEAKING: 'SPEAKING'    // กำลังพูดตอบโต้
};

window.systemStatus = STATUS.IDLE; 
window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

// ฟังก์ชันควบคุมสถานะกลางพร้อม Log
function setStatus(newStatus) {
    if (window.systemStatus === newStatus) return;
    console.log(`%c🔄 [SYSTEM STATE]: ${window.systemStatus} -> ${newStatus}`, "color: #00ebff; font-weight: bold; background: #222; padding: 2px 5px; border-radius: 3px;");
    window.systemStatus = newStatus;
}

let idleTimer = null; 
const IDLE_TIME_LIMIT = 5000; 
let video; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

let wakeWordRecognition;
let manualMicOverride = false; 
let isWakeWordActive = false;
let lastFinalTranscript = ""; 

// --- 2. Mic & Speech Control ---

function toggleListening() { 
    console.log("🖱️ [User Action] Toggle Microphone");
    manualMicOverride = true;
    
    if (window.systemStatus === STATUS.SPEAKING) {
        window.speechSynthesis.cancel();
    }

    if (window.systemStatus === STATUS.LISTENING) { 
        forceStopAllMic();
        setStatus(STATUS.IDLE);
        manualMicOverride = false; 
        return; 
    } 

    forceStopAllMic(); 
    
    setTimeout(() => {
        if (!window.recognition) initSpeechRecognition();
        try {
            lastFinalTranscript = ""; 
            const inputField = document.getElementById('userInput');
            if (inputField) inputField.value = ""; 
            window.recognition.start(); 
        } catch (e) { 
            console.error("❌ Mic Start Error:", e);
            setStatus(STATUS.IDLE);
        }
    }, 200); 
}

function forceStopAllMic() {
    isWakeWordActive = false;
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;

    window.recognition.onstart = () => {
        setStatus(STATUS.LISTENING);
        lastFinalTranscript = ""; // ล้างค่าสะสมป้องกันตัวหนังสือซ้ำ
        const inputField = document.getElementById('userInput');
        if (inputField) inputField.value = ""; 
        
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse(window.currentLang === 'th' ? "กำลังฟัง... พูดได้เลยครับ" : "Listening...");
    };

    window.recognition.onresult = (e) => {
        if (window.systemStatus !== STATUS.LISTENING) return;
        if (window.micTimer) clearTimeout(window.micTimer);
        
        let interimTranscript = "";
        let finalSegment = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) finalSegment += e.results[i][0].transcript;
            else interimTranscript += e.results[i][0].transcript;
        }

        if (finalSegment) lastFinalTranscript += finalSegment;
        const inputField = document.getElementById('userInput');
        const currentDisplay = lastFinalTranscript + interimTranscript;

        if (currentDisplay.trim() !== "") {
            if (inputField) inputField.value = currentDisplay;

            window.micTimer = setTimeout(() => {
                const finalQuery = currentDisplay.trim();
                if (finalQuery !== "" && window.systemStatus === STATUS.LISTENING) {
                    setStatus(STATUS.THINKING);
                    try { window.recognition.stop(); } catch(err) {} 
                    // ล้างข้อมูลทันทีหลังส่ง
                    if (inputField) inputField.value = ""; 
                    lastFinalTranscript = ""; 
                    getResponse(finalQuery); 
                }
            }, 2000); 
        }
    };

    window.recognition.onend = () => {
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.remove('recording');
        if (window.systemStatus === STATUS.LISTENING) setStatus(STATUS.IDLE);
    };
}

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    setStatus(STATUS.SPEAKING); 
    
    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    
    msg.onstart = () => { 
        updateLottie('talking'); 
    };
    
    msg.onend = () => { 
        updateLottie('idle'); 
        if (callback) callback();
        
        setTimeout(() => {
            // ปลดล็อคสถานะเพื่อให้กดปุ่มตัวเลือกได้แน่นอน
            if (window.systemStatus === STATUS.SPEAKING) setStatus(STATUS.IDLE);

            if (!isAtHome) {
                if (isGreeting) { 
                    window.allowWakeWord = true; 
                    if (typeof startWakeWord === "function") startWakeWord(); 
                } else if (!manualMicOverride) {
                    toggleListening(); 
                }
            }
        }, 800); 
    };
    
    msg.onerror = () => { setStatus(STATUS.IDLE); updateLottie('idle'); };
    window.speechSynthesis.speak(msg);
}

// --- 3. Core Logic & AI Functions ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    
    setStatus(STATUS.THINKING);
    logQuestionToSheet(userQuery); 
    isAtHome = false; 
    updateInteractionTime(); 
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
    
    const isLicense = query.includes("ใบขับขี่") || query.includes("license");
    const isRenew = query.includes("ต่อ") || query.includes("renew");
    if (isLicense && isRenew && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        const askMsg = "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg); 
        speak(askMsg);
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", s_th: "ต่อใบขับขี่ชั่วคราว", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
            { th: "แบบ 5 ปี", s_th: "ต่อใบขับขี่ 5 ปี เป็น 5 ปี", action: () => startLicenseCheck("แบบ 5 ปี") }
        ]);
        return;
    }

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) return;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                for (const key of keyList) {
                    let score = (query === key) ? 10.0 : calculateSimilarity(query, key) * 5;
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                }
            });
        }
        
        if (bestMatch.score >= 0.45 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer); 
            speak(bestMatch.answer); 
        } else { 
            const noDataMsg = "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ";
            displayResponse(noDataMsg); 
            speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { setStatus(STATUS.IDLE); }
}

// --- 4. UI & FAQ Functions ---

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return; 
    container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button'); 
        btn.className = 'faq-btn'; 
        btn.style.border = "2px solid #6c5ce7";
        btn.innerText = (window.currentLang === 'th' ? opt.th : opt.en || opt.th);
        
        btn.onclick = () => {
            console.log("👆 Option Clicked");
            window.speechSynthesis.cancel(); // หยุดเสียงทันที
            setStatus(STATUS.IDLE);         // ปลดล็อคสถานะ
            forceStopAllMic();              // ปิดไมค์เพื่อรับคำสั่งใหม่
            
            if (opt.action) opt.action(); 
            else if (opt.s_th) getResponse(window.currentLang === 'th' ? opt.s_th : opt.s_en); 
        };
        container.appendChild(btn);
    });
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    if (!window.localDatabase["FAQ"]) return;
    
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = window.currentLang === 'th' ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText;
            btn.onclick = () => { 
                window.speechSynthesis.cancel();
                setStatus(STATUS.IDLE);
                getResponse(qText); 
            };
            container.appendChild(btn);
        }
    });
}

// --- 5. Support Functions ---

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    const progBar = document.getElementById('splash-progress-bar');
    if (progBar) progBar.style.width = '100%';
    setTimeout(() => {
        if (splash) {
            splash.style.display = 'none';
            isAtHome = true;
            setStatus(STATUS.IDLE);
            window.hasGreeted = false;
            displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
            renderFAQButtons(); 
            initCamera();       
        }
    }, 500);
}

function resetToHome() {
    const now = Date.now();
    if (window.systemStatus !== STATUS.IDLE || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer(); 
        return;
    }
    if (isAtHome) return; 
    window.speechSynthesis.cancel();
    forceStopAllMic(); 
    window.hasGreeted = false;
    window.allowWakeWord = false; 
    setStatus(STATUS.IDLE);
    isAtHome = true; 
    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
}

function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }
function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); }

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = predictions.find(f => f.detection.score > 0.55 && f.detection.box.width > 90);
        if (face) {
            if (personInFrameTime === null) personInFrameTime = now;
            window.detectedGender = face.gender; 
            if ((now - personInFrameTime) >= 2000 && isAtHome && window.systemStatus === STATUS.IDLE && !window.hasGreeted) greetUser();
            lastSeenTime = now; 
        } else if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
            personInFrameTime = null; window.hasGreeted = false; forceStopAllMic(); 
            if (!isAtHome) restartIdleTimer();
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.systemStatus !== STATUS.IDLE) return;
    isAtHome = false; 
    window.hasGreeted = true; 
    const gender = window.detectedGender === 'female' ? "คุณผู้หญิง" : "คุณผู้ชาย";
    const finalGreet = `สวัสดีครับ ${gender} น้องนำทางยินดีให้บริการครับ มีอะไรให้ช่วยไหมครับ?`;
    displayResponse(finalGreet);
    speak(finalGreet, () => { window.allowWakeWord = true; }, true); 
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

function displayResponse(text) { 
    const responseEl = document.getElementById('response-text'); 
    if (responseEl) responseEl.innerHTML = text.replace(/\n/g, '<br>'); 
}

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { window.localDatabase = json.database; completeLoading(); }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; }
    } catch (err) { console.error("❌ Camera Error"); }
}

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        // setupWakeWord(); // เรียกถ้ามีการประกาศไว้
        requestAnimationFrame(detectPerson);
    } catch (err) { console.error("❌ Face API Error"); }
}

async function logQuestionToSheet(userQuery) {
    if (!userQuery || !GAS_URL) return;
    try {
        const finalUrl = `${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`;
        await fetch(finalUrl, { mode: 'no-cors' });
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', initDatabase);
