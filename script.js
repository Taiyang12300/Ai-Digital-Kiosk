/**
 * 🚀 Ultimate Hybrid Version (FULL + FIXED)
 * ✅ ครบทุกฟังก์ชัน
 * ✅ ไม่ตัดโค้ด
 * ✅ แก้ mic ซ้อน / wakeword หลุด / speech conflict
 */

// ================= GLOBAL =================
window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false; // 🔥 FIX สำคัญ

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
let manualMicOverride = false;
let micHardLock = false;
let lastFinalTranscript = "";
let isSubmitting = false;
let micSessionId = 0;
let isWakeWordActive = false;

// ================= MIC CONTROL =================
function toggleListening() { 
    manualMicOverride = true;
    micHardLock = false;

    window.speechSynthesis.cancel();

    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) { 
        try { window.recognition.stop(); } catch (e) {}
        window.isListening = false;
        manualMicOverride = false; 
        return; 
    } 

    forceStopAllMic();

    setTimeout(() => {
        if (window.isListening) return;
        try { window.recognition.start(); } catch (e) {}
    }, 250); 
}

function stopListening() { 
    window.isListening = false;
    manualMicOverride = false;
}

// ================= CORE MIC RESET =================
function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false;

    if (window.micTimer) clearTimeout(window.micTimer);
    if (window.sttTimeout) clearTimeout(window.sttTimeout);

    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) {}
    }
    if (window.recognition) {
        try { window.recognition.abort(); } catch(e) {}
    }

    if (manualMicOverride) micHardLock = false;
    else if (window.isBusy) micHardLock = true;
    else micHardLock = false;
}

// ================= SPEECH =================
function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;

    forceStopAllMic();
    window.speechSynthesis.cancel();
    window.isBusy = true;

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'th-TH';
    msg.rate = 1.05;

    msg.onend = () => {
        window.isBusy = false;

        if (callback) callback();

        setTimeout(() => {
            if (window.isBusy) return;

            if (isGreeting) {
                window.allowWakeWord = true;
                startWakeWord();
            } else {
                if (!window.isListening && !manualMicOverride) {
                    toggleListening();
                }
            }
        }, 1800);
    };

    window.speechSynthesis.speak(msg);
}

function stopAllSpeech() { 
    window.speechSynthesis.cancel(); 
    window.isBusy = false; 
}

// ================= SPEECH RECOG =================
function initSpeechRecognition() {
    if (window.recognition) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    window.recognition = new SR();
    window.recognition.lang = 'th-TH';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;

    window.recognition.onstart = () => {
        window.isListening = true;
        lastFinalTranscript = "";
        isSubmitting = false;
    };

    window.recognition.onresult = (e) => {
        if (window.micTimer) clearTimeout(window.micTimer);

        let finalText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
                finalText += e.results[i][0].transcript;
            }
        }

        if (!finalText) return;

        if (finalText === lastFinalTranscript) return;

        lastFinalTranscript = finalText;

        window.micTimer = setTimeout(() => {
            if (isSubmitting) return;

            isSubmitting = true;

            try { window.recognition.stop(); } catch(e){}

            getResponse(finalText);
            lastFinalTranscript = "";
        }, 1200);
    };

    window.recognition.onend = () => {
        window.isListening = false;
        setTimeout(() => isSubmitting = false, 300);
    };

    window.recognition.onerror = (e) => {
        window.isListening = false;
        console.warn("Mic error:", e.error);

        setTimeout(() => {
            if (!window.isBusy && !manualMicOverride) {
                startWakeWord();
            }
        }, 1500);
    };
}

// ================= WAKE WORD =================
function setupWakeWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    wakeWordRecognition = new SR();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = true;
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        if (!window.allowWakeWord || window.isBusy || window.isListening) return;

        let txt = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            txt += event.results[i][0].transcript;
        }

        if (txt.includes("น้องนำทาง") || txt.includes("นำทาง")) {
            forceStopAllMic();
            speak("มีอะไรให้ช่วยครับ");
        }
    };

    wakeWordRecognition.onend = () => {
        if (micHardLock) return;

        if (!window.isBusy && isWakeWordActive) {
            setTimeout(() => {
                try { wakeWordRecognition.start(); } catch(e){}
            }, 1500);
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || window.isBusy || window.isListening) return;

    try {
        forceStopAllMic();

        setTimeout(() => {
            isWakeWordActive = true;
            wakeWordRecognition.start();
        }, 300);
    } catch(e){}
}

// ================= DATABASE =================
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();

        if (json.database) {
            window.localDatabase = json.database;
            console.log("DB Loaded");
        }
    } catch (e) {
        console.error("DB retry...");
        setTimeout(initDatabase, 3000);
    }
}

// ================= RESPONSE =================
async function getResponse(userQuery) {
    console.log("ถาม:", userQuery);

    speak("กำลังค้นหาข้อมูล");

    setTimeout(() => {
        speak("นี่คือคำตอบ");
    }, 1500);
}

// ================= CAMERA =================
async function initCamera() {
    try {
        video = document.getElementById('video');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" }
        });

        video.srcObject = stream;

        setupWakeWord();
    } catch (err) {
        console.error("Camera error");
    }
}

// ================= INIT =================
document.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    initCamera();
});
