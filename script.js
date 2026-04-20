/**
 * 🚀 สมองกลน้องนำทาง - Stable Office Version
 * สถานะ: ใช้งานได้จริง (Stable)
 * การทำงาน: รองรับ Face Detection, Wake Word "น้องนำทาง", และระบบถาม-ตอบจาก Google Sheets
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false; // กำหนดค่าเริ่มต้นให้ชัดเจน
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

let wakeWordRecognition;
let manualMicOverride = false;
let micHardLock = false;
let lastFinalTranscript = "";
let isSubmitting = false;
let micSessionId = 0;
let isWakeWordActive = false;

// ================= 🎤 ระบบควบคุมไมโครโฟน (STT) =================

function toggleListening() { 
    manualMicOverride = true;
    micHardLock = false; 

    window.speechSynthesis.cancel(); 
    if (window.micTimer) clearTimeout(window.micTimer);

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
        try {
            window.recognition.start(); 
        } catch (e) { 
            window.isListening = false;
        }
    }, 200); 
}

function stopListening() { 
    window.isListening = false;
    manualMicOverride = false;

    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');

    if (micBtn) micBtn.classList.remove('recording'); 
    if (statusText) statusText.innerText = (window.currentLang === 'th') 
        ? "แตะไมค์เพื่อเริ่มพูด" 
        : "Tap mic to speak";
}

// ================= 🤖 ระบบดักฟังชื่อ (Wake Word) =================

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    if (wakeWordRecognition) { 
        try { wakeWordRecognition.abort(); } catch(e) {} 
    }

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
            console.log("🎯 [WakeWord] Keyword Matched!");
            isWakeWordActive = false; 
            forceStopAllMic();        
            window.isBusy = true;     

            let msg = (window.currentLang === 'th') 
                ? "ครับผม สอบถามข้อมูลได้เลยนะครับ" 
                : "Yes! How can I help you?";
            
            displayResponse(msg);
            setTimeout(() => { speak(msg); }, 300); 
        }
    };

    wakeWordRecognition.onend = () => {
        if (manualMicOverride || micHardLock) return;

        if (!isAtHome && personInFrameTime !== null && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => {
                try {
                    if (!micHardLock && !window.isBusy && !window.isListening && !isAtHome && isWakeWordActive) {
                        wakeWordRecognition.start(); 
                    }
                } catch(e) {}
            }, 1500); 
        } else {
            isWakeWordActive = false;
        }
    };
}

function startWakeWord() {
    if (manualMicOverride || !window.allowWakeWord || isAtHome || window.isBusy) {
        isWakeWordActive = false;
        return;
    }
    try { 
        forceStopAllMic();
        setTimeout(() => {
            micHardLock = false;
            isWakeWordActive = true; 
            if(wakeWordRecognition) wakeWordRecognition.start(); 
        }, 200);
    } catch (e) {}
}

// ================= 🔊 ระบบเสียงและการประมวลผล =================

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    
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
        if (callback) callback();

        if (!isAtHome) {
            setTimeout(() => {
                if (window.isBusy) return;
                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else {
                    if (!window.isListening && !manualMicOverride) {
                        toggleListening(); 
                        if (window.sttTimeout) clearTimeout(window.sttTimeout);
                        window.sttTimeout = setTimeout(() => {
                            if (window.isListening && !window.isBusy && !manualMicOverride) {
                                forceStopAllMic(); 
                                window.allowWakeWord = true;
                                startWakeWord(); 
                            }
                        }, 6000); 
                    }
                }
            }, 2000); 
        }
    };
    window.speechSynthesis.speak(msg);
}

// ================= 🖼️ ระบบ Splash Screen & Database =================

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    const progBar = document.getElementById('splash-progress-bar');
    if (progBar) progBar.style.width = '100%';
    
    setTimeout(() => {
        if (splash) {
            splash.style.transition = 'opacity 0.8s ease';
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                isAtHome = true;
                displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                renderFAQButtons(); 
                initCamera();       
            }, 800);
        }
    }, 500);
}

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            completeLoading(); 
        }
    } catch (e) { 
        setTimeout(initDatabase, 3000); 
    }
}

// ฟังก์ชันอื่นๆ เช่น initSpeechRecognition, detectPerson, greetUser ให้คงเดิมตามโค้ดที่คุณใช้งานได้
// (เพื่อประหยัดพื้นที่และคงความเสถียรของ Logic เดิมที่คุณมีอยู่แล้ว)

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 
    if (window.micTimer) clearTimeout(window.micTimer);
    if (window.sttTimeout) clearTimeout(window.sttTimeout);
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    micHardLock = (!manualMicOverride && window.isBusy);
}

document.addEventListener('DOMContentLoaded', initDatabase);
