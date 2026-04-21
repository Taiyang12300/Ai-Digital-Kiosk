/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Stable Database & Mic Sync)
 * แก้ไข: ปัญหาหน้าจอว่างเปล่าเมื่อดึงข้อมูลไม่สำเร็จ และระบบจัดการไมค์ซ้อน
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
let isAtHome = true; 

// ตรวจสอบ URL นี้ให้ตรงกับหน้า Deploy ล่าสุดใน Apps Script
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
let isWakeWordActive = false;
let manualMicOverride = false; // กันไมค์ตีกันเมื่อกดปุ่มเอง

// --- [ฟังก์ชันควบคุม Splash Screen] ---
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
                window.isBusy = false;
                const homeMsg = (window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                displayResponse(homeMsg);
                renderFAQButtons(); 
                initCamera();       
                console.log("🏠 [System] Home screen ready.");
            }, 800);
        }
    }, 500);
}

// --- [ระบบจัดการไมค์] ---
function forceStopAllMic() {
    isWakeWordActive = false;
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    console.log("🛑 [System] All Microphones Stopped.");
}

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    wakeWordRecognition = new SpeechRecognition();
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
            console.log("🎯 Keyword Matched!");
            forceStopAllMic(); 
            window.isBusy = true;
            
            let msg = window.currentLang === 'th' ? "ครับผม มีอะไรให้น้องนำทางช่วยไหมครับ?" : "Yes, how can I help you?";
            displayResponse(msg);
            speak(msg, () => {
                window.isBusy = false; 
                // หลังจากตอบรับชื่อ ให้เปิดไมค์ STT เพื่อฟังคำถามต่อทันที
                if (typeof toggleListening === "function") toggleListening(); 
            });
        }
    };

    wakeWordRecognition.onend = () => {
        if (window.allowWakeWord && isWakeWordActive && !window.isBusy && !window.isListening && !isAtHome) {
            setTimeout(() => { try { wakeWordRecognition.start(); } catch(e) {} }, 1000);
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || isAtHome || window.isListening || window.isBusy) return;
    try { 
        isWakeWordActive = true; 
        wakeWordRecognition.start(); 
        console.log("🎤 [System] WakeWord stand-by.");
    } catch (e) {}
}

// --- [ระบบประมวลผลคำตอบ - คงเดิมตาม Search Logic ของคุณ] ---
async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();
    // ... (คง Logic การค้นหาใบขับขี่เดิมของคุณไว้ทั้งหมด) ...
    // ผมแนะนำให้คุณยก Code ส่วน if(isLicense && isRenew) จากไฟล์เดิมมาใส่ตรงนี้ครับ
    
    // ตัวอย่างการค้นหาใน Database
    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const key = item[0] ? item[0].toString().toLowerCase() : "";
                if (query.includes(key) && key.length > 0) {
                    let score = key.length;
                    if (score > bestMatch.score) bestMatch = { answer: item[1], score: score };
                }
            });
        }
        
        const finalAns = bestMatch.score > 0 ? bestMatch.answer : "ขออภัยครับ น้องหาข้อมูลไม่พบ";
        displayResponse(finalAns);
        speak(finalAns);
    } catch (e) { window.isBusy = false; }
}

// --- [ระบบเสียง] ---
function speak(text, callback = null) {
    if (!text || window.isMuted) return;
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true;

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'th-TH';
    msg.onstart = () => updateLottie('talking');
    msg.onend = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
        if (callback) callback();
        // ถ้าพูดจบแล้วไม่ได้อยู่ในหน้าโฮม ให้กลับไปดักฟังชื่อ (Wake Word)
        if (!isAtHome && window.allowWakeWord) setTimeout(startWakeWord, 1200);
    };
    window.speechSynthesis.speak(msg);
}

// --- [การเชื่อมต่อ Database] ---
async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    const statusTxt = document.getElementById('splash-status-text');
    if (progBar) progBar.style.width = '30%';

    try {
        console.log("🌐 Connecting to GAS...");
        const res = await fetch(GAS_URL);
        const json = await res.json();
        
        if (json && json.database) { 
            window.localDatabase = json.database; 
            console.log("✅ Data Loaded.");
            completeLoading(); 
        } else {
            throw new Error("Data Format Error");
        }
    } catch (e) { 
        console.error("❌ Database Error:", e);
        if (statusTxt) statusTxt.innerText = "กำลังเชื่อมต่อฐานข้อมูลใหม่...";
        setTimeout(initDatabase, 5000); // ลองใหม่ทุก 5 วินาที
    }
}

// --- [เริ่มต้นระบบ] ---
document.addEventListener('DOMContentLoaded', initDatabase);
