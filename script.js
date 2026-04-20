/**
 * 🚀 สมองกลน้องนำทาง - Optimized Single Status Control
 */

// --- 1. Constants & Global State (Clean & Lean) ---
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

// ตัวแปรควบคุมภายใน (Scope ไฟล์)
let isAtHome = true; 
let idleTimer = null; 
let video; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 
const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let recognition;
let wakeWordRecognition;
let manualMicOverride = false;

function setStatus(newStatus) {
    window.systemStatus = newStatus;
    console.log(`%c🔄 [SYSTEM]: ${newStatus}`, "color: #00ebff; font-weight: bold; background: #222;");
}

// --- 2. ระบบจัดการไมค์ (Refactored to STATUS) ---

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

    // ตัวแปร Local สำหรับเก็บข้อความในเซสชันนี้
    let currentTranscript = "";

    recognition.onstart = () => {
        setStatus(STATUS.LISTENING);
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse("กำลังฟัง... พูดได้เลยครับ");
        currentTranscript = ""; 
    };

    recognition.onresult = (e) => {
        if (window.systemStatus !== STATUS.LISTENING) return;
        if (window.micTimer) clearTimeout(window.micTimer);

        let interimText = "";
        let finalText = "";

        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            else interimText += e.results[i][0].transcript;
        }

        currentTranscript += finalText;
        const inputField = document.getElementById('userInput');
        if (inputField) inputField.value = currentTranscript + interimText;

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

// --- 3. ระบบเสียงและ AI Response ---

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    setStatus(STATUS.SPEAKING); 

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    
    msg.onstart = () => { updateLottie('talking'); };
    
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

// --- 4. Wake Word & Face API ---

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
        // วนลูปฟังต่อเฉพาะเมื่อ IDLE และอยู่นอกหน้า Home
        if (window.systemStatus === STATUS.IDLE && !isAtHome && window.allowWakeWord) {
            try { wakeWordRecognition.start(); } catch(e) {}
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || isAtHome || window.systemStatus !== STATUS.IDLE) return;
    forceStopAllMic();
    setTimeout(() => {
        try { wakeWordRecognition.start(); } catch(e) {}
    }, 300);
}

// --- 5. ระบบ Initialization & Support (คงเดิม) ---

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            completeLoading(); 
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
            isAtHome = true;
            setStatus(STATUS.IDLE);
            displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
            renderFAQButtons(); 
            initCamera();       
        }, 800);
    }
}

// ฟังก์ชันเสริมอื่นๆ (ใช้ของเดิมต่อได้ทันที)
async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) { setStatus(STATUS.IDLE); return; }
    updateInteractionTime(); 
    updateLottie('thinking');
    // ... Logic เดิมของคุณ ...
}

async function initCamera() { /* โค้ดกล้องเดิม */ }
async function loadFaceModels() { /* โค้ดโหลด Model เดิม */ }
async function detectPerson() { /* โค้ดตรวจจับหน้าเดิม */ }
function greetUser() { /* โค้ดทักทายเดิม */ }
function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }
function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); if (!isAtHome) idleTimer = setTimeout(resetToHome, 5000); }
function resetToHome() {
    if (window.systemStatus !== STATUS.IDLE || personInFrameTime !== null) return;
    isAtHome = true; window.hasGreeted = false; window.allowWakeWord = false;
    displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
}

document.addEventListener('DOMContentLoaded', initDatabase);
