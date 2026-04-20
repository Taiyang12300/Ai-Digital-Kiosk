/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Workflow Version
 * ปรับปรุงระบบการจัดการเสียงและลำดับสถานะ (State Machine) ให้เสถียรขึ้น
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false;
window.recognition = null; 
window.isPrinting = false; // [NEW] สถานะควบคุมการพิมพ์

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

// --- 🧹 [NEW] ฟังก์ชันกวาดล้างระบบ (Cleanup) ---
function globalCleanup() {
    console.log("🧹 [System] Global Cleanup...");
    window.speechSynthesis.cancel(); // หยุดเสียงพูด
    
    // หยุดไฟล์เสียง MP3 ทั้งหมด
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => {
        a.pause();
        a.currentTime = 0;
    });

    forceStopAllMic(); // หยุดไมค์ทั้งหมด
    
    if (window.micTimer) clearTimeout(window.micTimer);
    if (window.sttTimeout) clearTimeout(window.sttTimeout);
    
    window.isBusy = false;
    window.isPrinting = false;
    updateLottie('idle');
}

// --- 🚩 ระบบไมโครโฟน STT (ปุ่มไมค์) ---
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = true; 
    window.recognition.interimResults = true; 

    window.recognition.onstart = () => { 
        window.isListening = true;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording'); 
    };

    window.recognition.onresult = (e) => {
        if (window.micTimer) clearTimeout(window.micTimer);
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            transcript += e.results[i][0].transcript;
        }

        if (transcript.trim() !== "") {
            const inputField = document.getElementById('userInput');
            if (inputField) inputField.value = transcript;
            
            window.micTimer = setTimeout(() => {
                processQuery(transcript);
                window.recognition.stop(); 
            }, 1800); 
        }
    };

    window.recognition.onend = () => { 
        stopListening(); 
        // กลับไปดักฟังชื่อหลังจากถามเสร็จ (ถ้าไม่ได้ยุ่งอยู่)
        if (!window.isBusy && !isAtHome && !window.isPrinting) {
            setTimeout(startWakeWord, 1000);
        }
    };
}

function toggleListening() { 
    // 🚀 MASTER OVERRULE: กดแล้วต้องหยุดเสียงทุกอย่างทันที
    globalCleanup(); 

    if (window.isListening) { 
        if (window.recognition) window.recognition.stop(); 
    } else { 
        try {
            if (window.recognition) window.recognition.start(); 
        } catch (e) { console.warn("Mic Start Error:", e); }
    } 
}

function stopListening() { 
    window.isListening = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.remove('recording'); 
}

// --- 🚩 ฟังก์ชันควบคุม Splash & Home ---
function completeLoading() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            isAtHome = true;
            globalCleanup(); 
            initCamera();       
            initSpeechRecognition();
        }, 800);
    }
}

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    console.log("🛑 [System] Mics Off.");
}

// --- 🚩 ระบบเสียง MP3 และการ Print (ปรับปรุงตามที่คุย) ---
function playAudioLink(url, callback = null) {
    if (!url) return;
    globalCleanup(); // ล้างของเก่าก่อนเล่นเสียงใหม่
    
    window.isBusy = true;
    updateLottie('talking');
    const audio = new Audio(url);

    audio.onended = () => {
        window.isBusy = false;
        updateLottie('idle');
        if (callback) callback();
        else if (!isAtHome) setTimeout(startWakeWord, 1500); // จบแล้วกลับไปดักฟัง
    };

    audio.play().catch(e => { window.isBusy = false; });
}

function printLicenseNote(type, note, docs) {
    console.log("🖨️ Printing...");
    window.isPrinting = true;
    // ตัวอย่างการเรียกเล่นเสียง MP3 ขณะปริ้น
    const printSoundUrl = "YOUR_PRINT_SOUND_URL.mp3"; 
    playAudioLink(printSoundUrl, () => {
        window.isPrinting = false;
        resetToHome(); // ปริ้นจบกลับหน้า Home
    });
}

// --- 🚩 ระบบ Wake Word (น้องนำทาง) ---
function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        if (window.isBusy || window.isListening) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript.includes("น้องนำทาง") || transcript.includes("สวัสดีน้องนำทาง")) {
            forceStopAllMic();
            window.isBusy = true;
            const affirmations = ["ครับผม", "สวัสดีครับ", "น้องนำทางพร้อมช่วยแล้วครับ"];
            let msg = affirmations[Math.floor(Math.random() * affirmations.length)];
            
            displayResponse(msg);
            speak(msg, () => {
                // พูดตอบรับจบ -> เปิดปุ่มไมค์ (STT) เพื่อรอรับคำถาม
                setTimeout(toggleListening, 500); 
            });
        }
    };

    wakeWordRecognition.onend = () => {
        if (!isAtHome && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => { if (isWakeWordActive) try { wakeWordRecognition.start(); } catch(e) {} }, 1000);
        }
    };
}

function startWakeWord() {
    if (isAtHome || window.isListening || window.isBusy) return;
    forceStopAllMic(); 
    setTimeout(() => {
        isWakeWordActive = true; 
        try { wakeWordRecognition.start(); } catch (e) {}
    }, 500);
}

// --- 🚩 ระบบดวงตา AI ---
async function detectPerson() {
    if (!isDetecting || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
        if (predictions.length > 0) {
            if (personInFrameTime === null) personInFrameTime = now;
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy) { greetUser(); }
            lastSeenTime = now; 
        } else {
            // คนหายไปเกิน 5 วินาที -> Reset กลับหน้า Home
            if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
                globalCleanup();
                resetToHome();
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

    const hour = new Date().getHours();
    let timeGreet = hour < 12 ? "สวัสดีตอนเช้าครับ" : hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ";
    let finalGreet = `${timeGreet} น้องนำทางยินดีให้บริการ มีอะไรให้ช่วยไหมครับ?`;

    displayResponse(finalGreet);
    speak(finalGreet, () => { 
        window.isBusy = false; 
        startWakeWord(); // ทักจบเปิดโหมดดักฟังชื่อ
    }); 
}

// --- 🚩 ระบบเสียงพูด (TTS) ---
function speak(text, callback = null) {
    if (!text || window.isMuted) return;
    
    forceStopAllMic(); // ปิดไมค์ก่อนพูดเสมอ
    window.speechSynthesis.cancel();
    window.isBusy = true; 

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'th-TH';
    msg.onstart = () => { updateLottie('talking'); };
    msg.onend = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
        if (callback) callback();
        else if (!isAtHome && !window.isListening) {
            // ถ้าไม่มี callback ให้รอ 2 วิแล้วเปิด Wake Word
            setTimeout(startWakeWord, 2000);
        }
    };
    window.speechSynthesis.speak(msg);
}

async function getResponse(userQuery) {
    globalCleanup(); // กดถามใหม่ต้องล้างค่าเดิม
    window.isBusy = true;
    updateLottie('thinking');
    
    // ... โลจิกการค้นหาข้อมูลเดิมของคุณ ...
    // เมื่อได้คำตอบ (Assume bestMatch.answer)
    // displayResponse(bestMatch.answer);
    // speak(bestMatch.answer);
}

function resetToHome() {
    globalCleanup();
    isAtHome = true;
    window.hasGreeted = false;
    displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
    renderFAQButtons();
}

// --- การเริ่มต้นระบบ ---
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

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    setupWakeWord(); 
    requestAnimationFrame(detectPerson);
}

async function initCamera() {
    video = document.getElementById('video'); 
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream; 
    video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; 
}

document.addEventListener('DOMContentLoaded', initDatabase);
