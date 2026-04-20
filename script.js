/**
 * 🚀 สมองกลน้องนำทาง - FULL FUNCTION & SINGLE STATUS CONTROL
 * รักษาฟังก์ชันเดิมครบถ้วน ปรับปรุงระบบคุมสถานะเพื่อไม่ให้ Logic ตีกัน
 */

// --- 1. Constants & Global State (Cleaned) ---
const STATUS = {
    IDLE: 'IDLE',
    LISTENING: 'LISTENING',
    THINKING: 'THINKING',
    SPEAKING: 'SPEAKING'
};

window.systemStatus = STATUS.IDLE; 
window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let isAtHome = true; 
let video; 
let recognition;
let wakeWordRecognition;
let manualMicOverride = false;
let idleTimer = null; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

// ฟังก์ชันเปลี่ยนสถานะหนึ่งเดียว (Single Source of Truth)
function setStatus(newStatus) {
    window.systemStatus = newStatus;
    console.log(`%c🔄 [SYSTEM STATE]: ${newStatus}`, "color: #00ebff; font-weight: bold; background: #222;");
}

// --- 2. ระบบจัดการไมค์ (STT & Wake Word Control) ---

function forceStopAllMic() {
    if (recognition) { try { recognition.abort(); } catch(e) {} }
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.micTimer) clearTimeout(window.micTimer);
    if (window.sttTimeout) clearTimeout(window.sttTimeout);
}

function toggleListening() { 
    if (window.systemStatus === STATUS.SPEAKING) {
        window.speechSynthesis.cancel();
        setStatus(STATUS.IDLE);
    }
    if (window.systemStatus === STATUS.LISTENING) { 
        forceStopAllMic();
        setStatus(STATUS.IDLE);
        manualMicOverride = false;
        return; 
    } 
    manualMicOverride = true;
    forceStopAllMic();
    setTimeout(() => {
        if (!recognition) initSpeechRecognition();
        try {
            document.getElementById('userInput').value = "";
            recognition.start(); 
        } catch (e) { setStatus(STATUS.IDLE); }
    }, 250); 
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    let currentTranscript = "";

    recognition.onstart = () => {
        setStatus(STATUS.LISTENING);
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse("กำลังฟัง... พูดได้เลยครับ");
    };

    recognition.onresult = (e) => {
        if (window.systemStatus !== STATUS.LISTENING) return;
        if (window.micTimer) clearTimeout(window.micTimer);
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) currentTranscript += e.results[i][0].transcript;
            else interimText += e.results[i][0].transcript;
        }
        document.getElementById('userInput').value = currentTranscript + interimText;

        window.micTimer = setTimeout(() => {
            if (window.systemStatus !== STATUS.LISTENING) return;
            const finalQuery = (currentTranscript + interimText).trim();
            if (finalQuery) {
                setStatus(STATUS.THINKING); 
                forceStopAllMic();
                getResponse(finalQuery);
            }
        }, 1800);
    };

    recognition.onend = () => {
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.remove('recording');
        if (window.systemStatus === STATUS.LISTENING) setStatus(STATUS.IDLE);
    };
}

// --- 3. ระบบเสียง (TTS) ---

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    setStatus(STATUS.SPEAKING); 

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    msg.onstart = () => updateLottie('talking');
    msg.onend = () => { 
        updateLottie('idle'); 
        setStatus(STATUS.IDLE);
        if (callback) callback();
        if (!isAtHome) {
            setTimeout(() => {
                if (window.systemStatus !== STATUS.IDLE) return;
                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else if (!manualMicOverride) {
                    toggleListening(); 
                }
            }, 1500); 
        }
    };
    window.speechSynthesis.speak(msg);
}

// --- 4. ตรรกะการค้นหา (getResponse & Similarity) ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) { setStatus(STATUS.IDLE); return; }
    updateInteractionTime(); 
    updateLottie('thinking');
    
    const query = userQuery.toLowerCase().trim();
    let bestMatch = { answer: "", score: 0 };

    for (const sheetName of Object.keys(window.localDatabase)) {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
        window.localDatabase[sheetName].forEach(item => {
            const key = item[0] ? item[0].toString().toLowerCase() : "";
            let score = calculateSimilarity(query, key);
            if (score > bestMatch.score) {
                bestMatch = { 
                    answer: window.currentLang === 'th' ? item[1] : (item[2] || item[1]), 
                    score: score 
                };
            }
        });
    }

    if (bestMatch.score > 0.45) {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const noData = window.currentLang === 'th' ? "ขออภัยครับ ไม่พบข้อมูล" : "Sorry, I don't know.";
        displayResponse(noData);
        speak(noData);
    }
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
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) 
                    newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue; lastValue = newVal;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

// --- 5. ระบบ Wake Word & Face API ---

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.lang = 'th-TH';
    wakeWordRecognition.onresult = (event) => {
        if (window.systemStatus !== STATUS.IDLE) return;
        let transcript = event.results[event.results.length - 1][0].transcript;
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            forceStopAllMic();
            speak("ครับผม มีอะไรให้น้องนำทางช่วยไหมครับ?");
        }
    };
    wakeWordRecognition.onend = () => {
        if (window.systemStatus === STATUS.IDLE && !isAtHome && window.allowWakeWord) {
            try { wakeWordRecognition.start(); } catch(e) {}
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || isAtHome || window.systemStatus !== STATUS.IDLE) return;
    forceStopAllMic();
    try { wakeWordRecognition.start(); } catch(e) {}
}

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { video.srcObject = stream; video.play(); loadFaceModels(); }
    } catch (err) { console.error("❌ Camera Error"); }
}

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        setupWakeWord(); 
        requestAnimationFrame(detectPerson);
    } catch (err) { console.error("❌ AI Model Fail"); }
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = predictions.find(f => {
            const box = f.detection.box;
            const centerX = box.x + (box.width / 2);
            return f.detection.score > 0.55 && box.width > 90 && (centerX > 80 && centerX < 560);
        });
        if (face) {
            if (personInFrameTime === null) personInFrameTime = now;
            if ((now - personInFrameTime) >= 2000 && isAtHome && window.systemStatus === STATUS.IDLE && !window.hasGreeted) { greetUser(); }
            lastSeenTime = now; 
        } else if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
            personInFrameTime = null; window.hasGreeted = false; window.allowWakeWord = false; forceStopAllMic(); 
            if (!isAtHome) restartIdleTimer();
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.systemStatus !== STATUS.IDLE) return;
    isAtHome = false; window.hasGreeted = true; 
    const finalGreet = "สวัสดีครับ น้องนำทางยินดีให้บริการ วันนี้รับบริการด้านไหนดีครับ?";
    displayResponse(finalGreet);
    speak(finalGreet, () => { window.allowWakeWord = true; }, true); 
}

// --- 6. UI Rendering & System Init ---

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        if (!row[0]) return;
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.innerText = (window.currentLang === 'th') ? row[0] : (row[1] || row[0]);
        btn.onclick = () => { getResponse(btn.innerText); };
        container.appendChild(btn);
    });
}

function displayResponse(text) { 
    const el = document.getElementById('response-text');
    if (el) el.innerHTML = text.replace(/\n/g, '<br>'); 
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

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { window.localDatabase = json.database; completeLoading(); }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            setStatus(STATUS.IDLE);
            displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
            renderFAQButtons();
            initCamera();
        }, 800);
    }
}

function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }
function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); if (!isAtHome) idleTimer = setTimeout(resetToHome, 5000); }
function resetToHome() {
    if (window.systemStatus !== STATUS.IDLE || personInFrameTime !== null) return;
    isAtHome = true; window.hasGreeted = false; window.allowWakeWord = false;
    displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
    renderFAQButtons();
}

document.addEventListener('DOMContentLoaded', initDatabase);
