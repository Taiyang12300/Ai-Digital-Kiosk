/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Stable Fix)
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
let isAtHome = true; 

// 🚩 แก้ไข: ตรวจสอบ URL ตรงนี้ให้ตรงกับ Script ID ของคุณอีกครั้งนะครับ
const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvl3XJw/exec"; 

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
let isMicTransitioning = false; 

// --- 🚩 ฟังก์ชันควบคุม Splash Screen ---
function completeLoading() {
    const splash = document.getElementById('splash-screen');
    const progBar = document.getElementById('splash-progress-bar');
    const statusTxt = document.getElementById('splash-status-text');

    if (progBar) progBar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = 'ระบบพร้อมใช้งานแล้ว';
    
    setTimeout(() => {
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                isAtHome = true;
                window.isBusy = false;
                window.hasGreeted = false;
                window.allowWakeWord = false; 

                const homeMsg = (window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                displayResponse(homeMsg);
                renderFAQButtons(); 
                initCamera();       
                console.log("🏠 [System] Home screen ready.");
            }, 800);
        }
    }, 1000);
}

// --- 🚩 ฟังก์ชันควบคุมไมค์และเสียง ---

function forceStopAllMic() {
    isWakeWordActive = false;
    isMicTransitioning = false; 
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) {}
    }
    if (window.recognition) {
        try { window.recognition.abort(); } catch(e) {}
    }
}

function playAudioLink(url, callback = null) {
    if (!url) return;
    stopAllSpeech(); 
    forceStopAllMic(); 
    window.isBusy = true;
    window.allowWakeWord = false; 
    
    updateLottie('talking');
    const audio = new Audio(url);
    
    audio.onended = () => {
        setTimeout(() => {
            window.isBusy = false;
            updateLottie('idle');
            if (callback) callback();
            else if (!isAtHome) { window.allowWakeWord = true; startWakeWord(); }
        }, 1000);
    };
    audio.play().catch(e => { window.isBusy = false; });
}

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }

    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (!window.allowWakeWord || window.isBusy || isListeningNow || isMicTransitioning) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            isWakeWordActive = false; 
            window.isBusy = true;
            forceStopAllMic(); 
            let msg = (window.currentLang === 'th') ? "ครับผม มีอะไรให้ช่วยไหมครับ?" : "How can I help you?";
            displayResponse(msg);
            speak(msg, () => {
                setTimeout(() => { 
                    window.isBusy = false; 
                    if (typeof toggleListening === "function") toggleListening(); 
                }, 500);
            });
        }
    };

    wakeWordRecognition.onend = () => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (window.isBusy || !window.allowWakeWord || isAtHome || isListeningNow || isMicTransitioning) {
            isWakeWordActive = false;
            return;
        }
        isMicTransitioning = true;
        setTimeout(() => {
            try { 
                if (!window.isBusy && window.allowWakeWord && !isListeningNow) {
                    wakeWordRecognition.start(); 
                    isWakeWordActive = true;
                }
            } catch(e) {} finally { isMicTransitioning = false; }
        }, 1200);
    };
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
    if (!window.allowWakeWord || isAtHome || isListeningNow || window.isBusy || isMicTransitioning) return;
    try { isWakeWordActive = true; wakeWordRecognition.start(); } catch (e) {}
}

// --- 🚩 ระบบดวงตา AI (Face-API) ---

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        setupWakeWord(); 
        requestAnimationFrame(detectPerson);
    } catch (err) { console.error("❌ AI Model Load Failed"); }
}

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

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    isAtHome = false; 
    window.hasGreeted = true; 
    window.isBusy = true; 
    const gender = window.detectedGender || 'male';
    let msg = (window.currentLang === 'th') ? `สวัสดีครับคุณ${gender === 'male' ? 'ผู้ชาย' : 'ผู้หญิง'} มีอะไรให้ช่วยไหมครับ?` : "Welcome, how can I help you?";
    displayResponse(msg);
    speak(msg, () => { 
        window.isBusy = false; 
        window.allowWakeWord = true; 
        startWakeWord();
    });
}

// --- 🚩 ระบบประมวลผลคำตอบ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    window.isBusy = true;
    updateLottie('thinking');

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const keys = item[0] ? item[0].toString().toLowerCase() : "";
                if (userQuery.toLowerCase().includes(keys) && keys.length > bestMatch.score) {
                    bestMatch = { answer: window.currentLang === 'th' ? item[1] : (item[2] || item[1]), score: keys.length };
                }
            });
        }
        if (bestMatch.answer) { displayResponse(bestMatch.answer); speak(bestMatch.answer); }
        else { const msg = "ขออภัยครับ ไม่พบข้อมูล"; displayResponse(msg); speak(msg); }
    } catch (err) { window.isBusy = false; }
}

function speak(text, callback = null) {
    if (!text || window.isMuted) return;
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true;
    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'th-TH';
    msg.onstart = () => { updateLottie('talking'); };
    msg.onend = () => { 
        setTimeout(() => {
            window.isBusy = false; 
            updateLottie('idle'); 
            if (callback) callback();
            else if (window.allowWakeWord && !isAtHome) startWakeWord();
        }, 1000);
    };
    window.speechSynthesis.speak(msg);
}

// --- 🚩 เริ่มต้นระบบ ---

function stopAllSpeech() { window.speechSynthesis.cancel(); window.isBusy = false; updateLottie('idle'); }

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

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText;
            btn.onclick = () => getResponse(qText);
            container.appendChild(btn);
        }
    });
}

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            renderFAQButtons(); 
            completeLoading();
        }
    } catch (e) { console.error("DB Load Error", e); setTimeout(initDatabase, 5000); }
}

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; }
    } catch (err) { console.error("❌ Camera Error"); }
}

document.addEventListener('DOMContentLoaded', initDatabase);
