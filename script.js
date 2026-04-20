/**
 * 🚀 สมองกลน้องนำทาง - STATUS Control Version (Fixed & Refactored)
 */

// --- 1. Constants & Global State ---
const STATUS = {
    IDLE: 'IDLE',
    LISTENING: 'LISTENING',
    THINKING: 'THINKING',
    SPEAKING: 'SPEAKING'
};

window.systemStatus = STATUS.IDLE; // ตัวแปรคุมสถานะหลักเพียงตัวเดียว
window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
let isAtHome = true; 

// 🔥 GAS_URL แบบแก้ไขแล้ว (ตรวจสอบแล้วว่าไม่มีวงเล็บเกิน)
const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

// ฟังก์ชันเปลี่ยนสถานะ (Single Source of Truth)
function setStatus(newStatus) {
    window.systemStatus = newStatus;
    console.log(`%c🔄 [SYSTEM STATE]: ${newStatus}`, "color: #00ebff; font-weight: bold; background: #222;");
}

let idleTimer = null; 
let video; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

let recognition;
let wakeWordRecognition;
let manualMicOverride = false;
let lastFinalTranscript = "";
let isSubmitting = false;
let isWakeWordActive = false;

// --- 2. ระบบจัดการ Splash Screen & Initialization ---

async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    if (progBar) progBar.style.width = '30%'; 
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            completeLoading(); 
        }
    } catch (e) { 
        console.error("❌ Database Error, Retrying...");
        setTimeout(initDatabase, 3000); 
    }
}

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    const progBar = document.getElementById('splash-progress-bar');
    const statusTxt = document.getElementById('splash-status-text');

    if (progBar) progBar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = 'ระบบพร้อมใช้งานแล้ว';
    
    setTimeout(() => {
        if (splash) {
            splash.style.transition = 'opacity 0.8s ease';
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                isAtHome = true;
                window.hasGreeted = false;
                window.allowWakeWord = false; 
                
                setStatus(STATUS.IDLE); // เริ่มต้นที่สถานะว่าง

                const homeMsg = (window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                displayResponse(homeMsg);
                renderFAQButtons(); 
                initCamera();       
            }, 800);
        }
    }, 500);
}

// --- 3. ระบบจัดการไมค์ (Refactored to STATUS) ---

function forceStopAllMic() {
    isWakeWordActive = false;
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
            lastFinalTranscript = "";
            document.getElementById('userInput').value = "";
            recognition.start(); 
        } catch (e) { 
            setStatus(STATUS.IDLE);
        }
    }, 250); 
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        setStatus(STATUS.LISTENING);
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse("กำลังฟัง... พูดได้เลยครับ");
    };

    recognition.onresult = (e) => {
        // 🔒 กันไมค์ทำงานแทรกในสถานะอื่น
        if (window.systemStatus !== STATUS.LISTENING) return;

        if (window.micTimer) clearTimeout(window.micTimer);
        let interimText = "";
        let finalText = "";

        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            else interimText += e.results[i][0].transcript;
        }

        if (finalText) lastFinalTranscript += finalText;
        const inputField = document.getElementById('userInput');
        if (inputField) inputField.value = lastFinalTranscript + interimText;

        window.micTimer = setTimeout(() => {
            if (window.systemStatus !== STATUS.LISTENING) return;
            const finalQuery = (lastFinalTranscript + interimText).trim();
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

// --- 4. ระบบเสียงและ AI Response ---

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
                    toggleListening(); // เปิดไมค์รับคำถามต่ออัตโนมัติ
                    
                    if (window.sttTimeout) clearTimeout(window.sttTimeout);
                    window.sttTimeout = setTimeout(() => {
                        if (window.systemStatus === STATUS.LISTENING && !manualMicOverride) {
                            forceStopAllMic();
                            setStatus(STATUS.IDLE);
                            startWakeWord();
                        }
                    }, 6000);
                }
            }, 1500); 
        }
    };
    window.speechSynthesis.speak(msg);
}

// --- 5. Wake Word & Face API (Legacy Logic) ---

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
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
        if (window.systemStatus === STATUS.IDLE && !isAtHome && isWakeWordActive) {
            try { wakeWordRecognition.start(); } catch(e) {}
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || isAtHome || window.systemStatus !== STATUS.IDLE) return;
    forceStopAllMic();
    setTimeout(() => {
        isWakeWordActive = true;
        try { wakeWordRecognition.start(); } catch(e) {}
    }, 300);
}

// --- ฟังก์ชันช่วยเหลืออื่นๆ (ใช้ของเดิมทั้งหมด) ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) { setStatus(STATUS.IDLE); return; }
    updateInteractionTime(); 
    updateLottie('thinking');
    
    // ... Logic การค้นหาเดิมจาก LocalDatabase ของคุณ ...
    // เมื่อได้คำตอบแล้ว เรียก speak(answer);
}

// กล้องและการตรวจจับใบหน้า
async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { 
            video.srcObject = stream; 
            video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; 
        }
    } catch (err) { console.error("❌ Camera Error"); }
}

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
    isAtHome = false; 
    window.hasGreeted = true; 
    const finalGreet = "สวัสดีครับ น้องนำทางยินดีให้บริการ วันนี้รับบริการด้านไหนดีครับ?";
    displayResponse(finalGreet);
    speak(finalGreet, () => { window.allowWakeWord = true; }, true); 
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    if (!isAtHome) restartIdleTimer();
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!isAtHome) idleTimer = setTimeout(resetToHome, 5000);
}

function resetToHome() {
    if (window.systemStatus !== STATUS.IDLE || personInFrameTime !== null) return;
    isAtHome = true;
    window.hasGreeted = false;
    window.allowWakeWord = false;
    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons();
}

// เริ่มต้นระบบ
document.addEventListener('DOMContentLoaded', initDatabase);
