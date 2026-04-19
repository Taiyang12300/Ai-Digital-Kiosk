/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Anti-Loop & Stable Mic Edition)
 * แก้ไข: ป้องกันอาการไมค์เปิดแล้วตัดวนลูป และเพิ่มจังหวะรอยต่อ (Safety Buffer) เพื่อความเสถียร
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvl)3XJw/exec"; 

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
let isMicTransitioning = false; // 🚩 ตัวแปรใหม่ป้องกันไมค์ติดอ่าง

// --- [ใหม่] ฟังก์ชันควบคุม Splash Screen ---
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

// --- 🚩 ฟังก์ชันกลางสำหรับจัดการสิทธิ์และการเล่นเสียง ---

function forceStopAllMic() {
    isWakeWordActive = false;
    isMicTransitioning = false; 
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) {}
    }
    if (window.recognition) {
        try { window.recognition.abort(); } catch(e) {}
    }
    console.log("🛑 [System] All Microphones Released.");
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
        // 🚩 หน่วงเวลา 1 วินาทีก่อนคืนค่า Busy เพื่อป้องกันไมค์ดีดกลับมาไวเกินไป
        setTimeout(() => {
            window.isBusy = false;
            updateLottie('idle');
            updateInteractionTime();
            
            if (callback) {
                callback();
            } else if (!isAtHome) {
                window.allowWakeWord = true;
                startWakeWord();
            }
        }, 1000);
    };
    
    audio.onerror = () => { 
        window.isBusy = false; 
        window.allowWakeWord = !isAtHome;
        updateLottie('idle'); 
    };
    
    audio.play().catch(e => { 
        window.isBusy = false; 
        window.allowWakeWord = !isAtHome;
    });
}

// --- 1. ระบบจัดการสถานะ & Wake Word Setup ---

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
            console.log("🎯 Keyword Matched!");
            isWakeWordActive = false; 
            window.isBusy = true;
            forceStopAllMic(); 

            let msg = (window.currentLang === 'th') 
                ? "ครับผม... มีอะไรให้น้องนำทางช่วยไหมครับ?" 
                : "Yes! How can I help you?";
            
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
        
        // 🚩 เงื่อนไขห้าม Restart: ถ้ากำลังยุ่ง, อยู่หน้าโฮม, หรือกำลังเริ่มต้นรอยต่อ
        if (window.isBusy || !window.allowWakeWord || isAtHome || isListeningNow || isMicTransitioning) {
            isWakeWordActive = false;
            return;
        }

        isMicTransitioning = true; // ล็อกสถานะรอยต่อ
        setTimeout(() => {
            try { 
                if (!window.isBusy && window.allowWakeWord && !isListeningNow) {
                    wakeWordRecognition.start(); 
                    isWakeWordActive = true;
                    console.log("🔄 [System] WakeWord Stable Restarted.");
                }
            } catch(e) { isWakeWordActive = false; }
            finally { isMicTransitioning = false; } // ปลดล็อก
        }, 1200); // หน่วงเวลาให้ Engine เคลียร์ตัวเองให้เสร็จ
    };

    wakeWordRecognition.onerror = (event) => {
        if (event.error !== 'no-speech') isWakeWordActive = false;
    };
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
    if (!window.allowWakeWord || isAtHome || isListeningNow || window.isMuted || window.isBusy || isMicTransitioning) {
        isWakeWordActive = false;
        return;
    }
    try { 
        isWakeWordActive = true; 
        wakeWordRecognition.start(); 
        console.log("🎤 [System] Mic Listening...");
    } catch (e) {}
}

function stopWakeWord() {
    isWakeWordActive = false; 
    if (!wakeWordRecognition) return;
    try { wakeWordRecognition.abort(); } catch (e) {}
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    if (!isAtHome) restartIdleTimer();
}

document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);

async function logQuestionToSheet(userQuery) {
    if (!userQuery || !GAS_URL) return;
    try {
        const finalUrl = `${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`;
        await fetch(finalUrl, { mode: 'no-cors' });
    } catch (e) {}
}

function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.classList.remove('muted');
}

function resetToHome() {
    const now = Date.now();
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer(); 
        return;
    }
    if (isAtHome) return; 
    stopAllSpeech(); 
    forceStopAllMic(); 
    forceUnmute(); 
    window.hasGreeted = false;
    window.allowWakeWord = false; 
    window.isBusy = false; 
    personInFrameTime = null;       
    isAtHome = true; 
    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

// --- 2. ระบบดวงตา AI (Face-API) ---

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
            window.detectedGender = face.gender; 
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) { greetUser(); }
            lastSeenTime = now; 
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
                personInFrameTime = null;   window.hasGreeted = false; window.allowWakeWord = false; forceStopAllMic(); 
                if (!isAtHome) restartIdleTimer();
            }
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    forceUnmute(); 
    isAtHome = false; 
    window.hasGreeted = true; 
    window.isBusy = true; 

    const now = new Date();
    const hour = now.getHours();
    const isThai = window.currentLang === 'th';
    const gender = window.detectedGender || 'male';

    let finalGreet = "";
    if (isThai) {
        let timeGreet = hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ");
        const pType = (gender === 'male') ? "คุณผู้ชาย" : "คุณผู้หญิง";
        finalGreet = `${timeGreet} ${pType}... มีอะไรให้น้องนำทางช่วยไหมครับ?`;
    } else {
        finalGreet = `Welcome Sir/Madam, How can I help you?`;
    }

    displayResponse(finalGreet);
    speak(finalGreet, () => { 
        window.isBusy = false; 
        window.allowWakeWord = true; 
        startWakeWord();
    });
}

// --- 🚩 3. ระบบคัดกรองใบขับขี่ (คงเดิม) ---
function startLicenseCheck(type) {
    forceStopAllMic(); isAtHome = false;
    const msg = window.currentLang === 'th' ? `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    displayResponse(msg);
    speak(msg, () => { window.isBusy = false; });
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", action: () => { forceStopAllMic(); showLicenseChecklist(type, 'normal'); } },
        { th: "⚠️ หมดอายุเกิน 1 ปี (แต่ไม่เกิน 3 ปี)", action: () => { forceStopAllMic(); showLicenseChecklist(type, 'over1'); } },
        { th: "❌ หมดอายุเกิน 3 ปี", action: () => { forceStopAllMic(); showLicenseChecklist(type, 'over3'); } }
    ]);
}

function showLicenseChecklist(type, expiry) {
    const isThai = window.currentLang === 'th';
    const isTemp = type.includes("ชั่วคราว");
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = expiry === 'normal' ? "ต่อได้ทันที" : "ต้องสอบข้อเขียน/ขับรถใหม่";
    
    let checklistHTML = "";
    docs.forEach((d, idx) => {
        checklistHTML += `<div class="check-item"><input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()"><label>${d}</label></div>`;
    });
    
    const resultHTML = `<div class="checklist-card"><strong>${type}</strong><br>💡 ${note}<hr>${checklistHTML}<button id="btnPrintGuide" style="display:none;" onclick="resetToHome()">🖨️ ปริ้นใบนำทาง</button></div>`;
    displayResponse(resultHTML);
    speak(isThai ? "กรุณาตรวจสอบเอกสารครับ" : "Please check documents.");
}

function checkChecklist() {
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (printBtn) printBtn.style.display = Array.from(checks).every(c => c.checked) ? 'block' : 'none';
}

// --- 🚩 4. ระบบประมวลผลคำตอบ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
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
        
        if (bestMatch.answer) {
            displayResponse(bestMatch.answer); 
            speak(bestMatch.answer); 
        } else {
            const msg = window.currentLang === 'th' ? "ขออภัยครับ ไม่พบข้อมูล" : "No info found.";
            displayResponse(msg); speak(msg);
        }
    } catch (err) { window.isBusy = false; }
}

// --- 5. ระบบเสียง (แก้ไขจังหวะไมค์) ---

function speak(text, callback = null) {
    if (!text || window.isMuted) return;
    
    isWakeWordActive = false; 
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true;

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    
    msg.onstart = () => { updateLottie('talking'); };
    
    msg.onend = () => { 
        // 🚩 หัวใจสำคัญ: หน่วงเวลา 1 วินาทีก่อนคืนค่า Busy
        setTimeout(() => {
            window.isBusy = false; 
            updateLottie('idle'); 
            if (callback) callback();
            else if (window.allowWakeWord && !isAtHome) startWakeWord();
        }, 1000);
    };
    window.speechSynthesis.speak(msg);
}

// --- 🚩 ฟังก์ชันอำนวยความสะดวก ---

function stopAllSpeech() { 
    window.speechSynthesis.cancel(); 
    window.isBusy = false; 
    updateLottie('idle'); 
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

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return; container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button'); btn.className = 'faq-btn';
        btn.innerText = opt.th;
        btn.onclick = opt.action;
        container.appendChild(btn);
    });
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

function displayResponse(text) { 
    const responseEl = document.getElementById('response-text');
    if (responseEl) responseEl.innerHTML = text.replace(/\n/g, '<br>'); 
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
    } catch (e) { setTimeout(initDatabase, 5000); }
}

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (video) { 
            video.srcObject = stream; 
            video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; 
        }
    } catch (err) { console.error("❌ Camera Error"); }
}

document.addEventListener('DOMContentLoaded', initDatabase);
