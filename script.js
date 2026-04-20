/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Refactored & Logic Fixed)
 * แก้ไข: ป้องกันการเปิดไมค์ซ้อน และจัดการสถานะ manualMicOverride ให้ถูกต้อง
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false; 
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
let micHardLock = false; 
let manualMicOverride = false; 
let isWakeWordActive = false;

// --- 🚩 ระบบจัดการไมโครโฟน (Manual vs Auto) ---
function toggleListening(isManual = true) { 
    // ถ้าคนกดเอง ให้ Priority สูงสุด
    manualMicOverride = isManual;
    micHardLock = false; 

    window.speechSynthesis.cancel(); 
    if (window.micTimer) clearTimeout(window.micTimer);
    
    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) { 
        try { window.recognition.stop(); } catch (e) {}
        window.isListening = false;
        if (isManual) manualMicOverride = false; 
        console.log("🎤 [Mic] Toggled OFF");
        return; 
    } 

    forceStopAllMic(); 
    
    setTimeout(() => {
        try {
            micHardLock = false; 
            window.recognition.start(); 
            console.log("🎤 [Mic] Toggled ON (Manual: " + isManual + ")");
        } catch (e) { 
            console.error("Mic Start Error:", e);
            window.isListening = false;
        }
    }, 200); 
}

function stopListening() { 
    window.isListening = false;
    manualMicOverride = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.remove('recording'); 
}

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 

    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }

    // ถ้ากดมือมา ห้ามล็อคเด็ดขาด
    if (manualMicOverride) {
        micHardLock = false;
    } else if (window.isBusy) {
        micHardLock = true;
    }
    console.log("🛑 [System] Mics Force Stopped (HardLock: " + micHardLock + ")");
}

// --- 1. Wake Word Setup ---
function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }

    wakeWordRecognition = new Recognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        if (!window.allowWakeWord || window.isBusy || window.isListening) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            console.log("🎯 [WakeWord] Matched!");
            isWakeWordActive = false; 
            forceStopAllMic();        
            window.isBusy = true;     

            let msg = window.currentLang === 'th' ? "ครับผม มีอะไรให้ช่วยไหมครับ?" : "Yes! How can I help you?";
            displayResponse(msg);
            
            setTimeout(() => {
                speak(msg, () => {
                    toggleListening(false); // ระบบเปิด STT อัตโนมัติหลังพูดจบ
                }); 
            }, 300); 
        }
    };

    wakeWordRecognition.onend = () => {
        if (manualMicOverride || micHardLock) return;
        if (!isAtHome && personInFrameTime !== null && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => {
                try {
                    if (!micHardLock && !window.isBusy && !window.isListening && isWakeWordActive) {
                        wakeWordRecognition.start(); 
                    }
                } catch(e) {}
            }, 1500); 
        }
    };
}

function startWakeWord() {
    if (manualMicOverride || window.isBusy || window.isListening) return;
    if (!window.allowWakeWord || isAtHome || window.isMuted) {
        isWakeWordActive = false;
        return;
    }
    try { 
        if (window.sttTimeout) clearTimeout(window.sttTimeout);
        forceStopAllMic();
        setTimeout(() => {
            if (!manualMicOverride && !window.isBusy) {
                micHardLock = false;
                isWakeWordActive = true; 
                wakeWordRecognition.start(); 
                console.log("🎤 [System] WakeWord Stand-by...");
            }
        }, 200);
    } catch (e) {}
}

// --- 2. Speak Function (Fixed Conflict) ---
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

        if (callback) {
            callback();
            return; 
        }

        if (!isAtHome) {
            setTimeout(() => {
                if (window.isBusy || manualMicOverride) return;

                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else {
                    if (!window.isListening && !manualMicOverride) {
                        toggleListening(false); // ระบบเปิดฟังต่อ

                        if (window.sttTimeout) clearTimeout(window.sttTimeout);
                        window.sttTimeout = setTimeout(() => {
                            if (window.isListening && !window.isBusy && !manualMicOverride) {
                                console.log("⏰ STT Timeout -> กลับไปรอฟังชื่อ");
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

// --- 3. Speech Recognition Setup ---
function initSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;

    window.recognition = new Recognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;

    window.recognition.onstart = () => {
        window.isListening = true;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse(window.currentLang === 'th' ? "กำลังฟัง... พูดได้เลยครับ" : "Listening...");
    };

    window.recognition.onresult = (e) => {
        if (window.micTimer) clearTimeout(window.micTimer);
        let transcript = "";
        for (let i = 0; i < e.results.length; ++i) { transcript += e.results[i][0].transcript; }

        if (transcript.trim() !== "") {
            const inputField = document.getElementById('userInput');
            if (inputField) inputField.value = transcript;

            window.micTimer = setTimeout(() => {
                const finalQuery = inputField ? inputField.value.trim() : transcript.trim();
                if (finalQuery !== "") {
                    try { window.recognition.stop(); } catch(err) {} 
                    if (inputField) inputField.value = ""; 
                    getResponse(finalQuery); 
                }
            }, 2500); 
        }
    };

    window.recognition.onend = () => {
        window.isListening = false;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.remove('recording');
    };
}

// --- 🚩 ฟังก์ชันพื้นฐานอื่นๆ (Database, Face-API) คงเดิมตาม Logic ที่ถูกต้องของคุณ ---

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
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            isAtHome = true; window.isBusy = false;
            displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อถามได้เลยครับ" : "Tap mic to speak.");
            renderFAQButtons(); initCamera();
        }, 800);
    }
}

// (รวมฟังก์ชัน calculateSimilarity, detectPerson, getResponse ฯลฯ ไว้ตามเดิม)
document.addEventListener('DOMContentLoaded', initDatabase);
