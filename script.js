/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Fixed & Optimized)
 * แก้ไข: ปุ่มกดไม่ไป, ตัวหนังสือพิมพ์ซ้ำ, และระบบ Auto-Mic หลังพูดจบ
 */

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
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

function setStatus(newStatus) {
    if (window.systemStatus === newStatus) return;
    console.log(`%c🔄 [STATUS]: ${window.systemStatus} -> ${newStatus}`, "color: #00ebff; font-weight: bold; background: #222;");
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
    console.log("🖱️ [Mic Action]");
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
        lastFinalTranscript = ""; 
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
    
    msg.onstart = () => { updateLottie('talking'); };
    
    msg.onend = () => { 
        updateLottie('idle'); 
        if (callback) callback();
        
        setTimeout(() => {
            // ป้องกันสถานะค้างเพื่อให้กดปุ่มต่อได้
            if (window.systemStatus === STATUS.SPEAKING) setStatus(STATUS.IDLE);

            if (!isAtHome) {
                if (isGreeting) { 
                    window.allowWakeWord = true; 
                    // startWakeWord(); // เปิดใช้งานถ้ามีฟังก์ชันนี้
                } else if (!manualMicOverride) {
                    console.log("🎤 Auto-Mic Start");
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
    updateLottie('thinking');
    
    // เคลียร์ช่องพิมพ์ทันที
    const inputField = document.getElementById('userInput');
    if (inputField) inputField.value = ""; 
    lastFinalTranscript = "";

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
    
    const isLicense = query.includes("ใบขับขี่") || query.includes("license");
    const isRenew = query.includes("ต่อ") || query.includes("renew");
    
    if (isLicense && isRenew && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        const askMsg = (window.currentLang === 'th') ? "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is it Temporary or 5-year?";
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
            displayResponse(noDataMsg); speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { setStatus(STATUS.IDLE); }
}

// แก้ไขฟังก์ชันแสดงปุ่มเพื่อให้กดได้เสถียรขึ้น
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
            window.speechSynthesis.cancel(); // หยุดเสียงพูดทันที
            setStatus(STATUS.IDLE);         // เคลียร์สถานะ
            forceStopAllMic();              // หยุดไมค์ก่อนเริ่มคำสั่งใหม่
            
            if (opt.action) opt.action(); 
            else if (opt.s_th) getResponse(window.currentLang === 'th' ? opt.s_th : opt.s_en); 
        };
        container.appendChild(btn);
    });
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
        setupWakeWord(); 
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

