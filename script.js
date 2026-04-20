/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Stable Sequential Logic)
 * แก้ไข: ระบบ Priority Lock ป้องกันไมค์แย่งทรัพยากรกัน
 * ปรับปรุง: เสถียรภาพการสลับโหมดไมค์ 100% พร้อมใช้งาน
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
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
let isWakeWordActive = false;

// --- 🚩 1. ระบบควบคุม Splash Screen & Database ---

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
                window.hasGreeted = false;
                window.allowWakeWord = false; 
                displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                renderFAQButtons(); 
                initCamera();       
            }, 800);
        }
    }, 500);
}

// --- 🚩 2. ฟังก์ชันหลักในการคุมจังหวะไมค์ (The Flow Controller) ---

function forceStopAllMic() {
    isWakeWordActive = false;
    if (window.sttTimeout) { clearTimeout(window.sttTimeout); window.sttTimeout = null; }
    
    // เคลียร์สถานะตัวแปรภายนอก (ถ้ามี)
    if (typeof isListening !== 'undefined') isListening = false; 

    // หยุด Recognition ทุกประเภท
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.remove('recording');
    console.log("🛑 [System] Mic Resources Released.");
}

function playAudioLink(url, callback = null) {
    if (!url) return;
    stopAllSpeech(); 
    forceStopAllMic(); 
    window.isBusy = true;
    updateLottie('talking');
    const audio = new Audio(url);
    audio.onended = () => {
        window.isBusy = false;
        updateLottie('idle');
        updateInteractionTime();
        if (callback) callback();
        else if (window.allowWakeWord && !isAtHome) setTimeout(startWakeWord, 1500);
    };
    audio.onerror = () => { window.isBusy = false; updateLottie('idle'); };
    audio.play().catch(e => { window.isBusy = false; });
}

// --- 🚩 3. ระบบ Wake Word & Stand-by ---

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
        // 🔒 LOCK: ห้ามทำงานถ้า AI กำลังพูด หรือ ปุ่ม STT ถูกกดใช้งานอยู่
        if (!window.allowWakeWord || window.isBusy || isListeningNow) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            console.log("🎯 [WakeWord] Matched!");
            forceStopAllMic();        
            window.isBusy = true;     
            let msg = window.currentLang === 'th' ? "ครับผม มีอะไรให้ช่วยไหมครับ?" : "Yes! How can I help you?";
            displayResponse(msg);
            setTimeout(() => { speak(msg); }, 300); 
        }
    };

    wakeWordRecognition.onend = () => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        // 🔄 Auto Restart: เฉพาะเมื่ออยู่ในเงื่อนไขที่พร้อม และไม่ถูก Lock โดยสถานะอื่น
        if (!isAtHome && personInFrameTime !== null && !window.isBusy && !isListeningNow && isWakeWordActive) {
            setTimeout(() => {
                try {
                    if (!window.isBusy && !isListeningNow && isWakeWordActive) {
                        wakeWordRecognition.start(); 
                    }
                } catch(e) {}
            }, 1000); 
        }
    };
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
    if (!window.allowWakeWord || isAtHome || isListeningNow || window.isBusy) {
        isWakeWordActive = false;
        return;
    }
    forceStopAllMic(); 
    setTimeout(() => {
        isWakeWordActive = true; 
        try { wakeWordRecognition.start(); } catch(e) {}
        console.log("🎤 [System] WakeWord Active.");
    }, 300);
}

// --- 🚩 4. ระบบตรวจจับใบหน้า & ทักทาย ---

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        setupWakeWord(); 
        requestAnimationFrame(detectPerson);
    } catch (err) { console.error("❌ Models Failed"); }
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
                personInFrameTime = null; window.hasGreeted = false; window.allowWakeWord = false; forceStopAllMic(); 
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

    const hour = new Date().getHours();
    let timeGreet = hour < 12 ? "สวัสดีตอนเช้าครับ" : hour === 12 ? "สวัสดีตอนเที่ยงครับ" : hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ";
    let pType = (window.detectedGender === 'female') ? "คุณผู้หญิง" : "คุณผู้ชาย";
    let finalGreet = `${timeGreet} ${pType}... มีอะไรให้ช่วยไหมครับ?`;

    displayResponse(finalGreet);
    speak(finalGreet, () => { 
        window.isBusy = false; 
        window.allowWakeWord = true; 
    }, true); 
}

// --- 🚩 5. ระบบประมวลผลคำตอบ & ข้อมูลใบขับขี่ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
    if ((query.includes("ใบขับขี่") || query.includes("ต่อ")) && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        forceStopAllMic(); 
        const askMsg = "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg); 
        speak(askMsg, () => { window.isBusy = false; });
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary", s_th: "ต่อใบขับขี่ชั่วคราว", action: () => { startLicenseCheck("แบบชั่วคราว (2 ปี)"); } },
            { th: "แบบ 5 ปี", en: "5-year", s_th: "ต่อใบขับขี่ 5 ปี เป็น 5 ปี", action: () => { startLicenseCheck("แบบ 5 ปี"); } }
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
                    let score = (query === key) ? 10 : calculateSimilarity(query, key) * 5;
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                }
            });
        }
        if (bestMatch.score >= 0.45) { displayResponse(bestMatch.answer); speak(bestMatch.answer); }
        else { 
            const noData = "ขออภัยครับ ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่นะครับ";
            displayResponse(noData); speak(noData);
        }
    } catch (err) { window.isBusy = false; }
}

function startLicenseCheck(type) {
    forceStopAllMic(); window.isBusy = true;
    const msg = `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?`;
    displayResponse(msg);
    speak(msg, () => { window.isBusy = false; });
    renderOptionButtons([
        { th: "✅ ยังไม่หมด / ไม่เกิน 1 ปี", action: () => { showLicenseChecklist(type, 'normal'); } },
        { th: "⚠️ เกิน 1 ปี (แต่ไม่เกิน 3 ปี)", action: () => { showLicenseChecklist(type, 'over1'); } },
        { th: "❌ เกิน 3 ปี", action: () => { showLicenseChecklist(type, 'over3'); } }
    ]);
}

// --- 🚩 6. ระบบเสียง (Sequence-Critical) ---

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
            // 🕒 WAIT: รอ 2 วินาทีเพื่อให้มั่นใจว่า hardware เสียงหยุดทำงานสนิท
            setTimeout(() => {
                if (window.isBusy) return;
                
                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else {
                    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
                    if (!isListeningNow && typeof toggleListening === "function") {
                        console.log("🎤 [System] Auto-starting STT...");
                        toggleListening(); 

                        if (window.sttTimeout) clearTimeout(window.sttTimeout);
                        window.sttTimeout = setTimeout(() => {
                            const stillListening = typeof isListening !== 'undefined' ? isListening : false;
                            if (stillListening && !window.isBusy) {
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

// --- 🚩 7. ฟังก์ชันตัวช่วยอื่นๆ (คงเดิม) ---

function stopAllSpeech() { window.speechSynthesis.cancel(); window.isBusy = false; updateLottie('idle'); }

function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }

function resetToHome() {
    const now = Date.now();
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) return;
    if (isAtHome) return; 
    stopAllSpeech(); forceStopAllMic(); 
    window.hasGreeted = false; window.allowWakeWord = false; window.isBusy = false; 
    personInFrameTime = null; isAtHome = true; 
    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
}

function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); }

function calculateSimilarity(s1, s2) {
    let longer = s1.length < s2.length ? s2 : s1;
    let shorter = s1.length < s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1, s2) {
    let costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) costs[j] = j;
            else if (j > 0) {
                let newVal = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue; lastValue = newVal;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
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
        if (json.database) { window.localDatabase = json.database; completeLoading(); }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; }
    } catch (err) { console.error("Camera Error"); }
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText;
            btn.onclick = () => { stopAllSpeech(); window.isBusy = false; getResponse(qText); };
            container.appendChild(btn);
        }
    });
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return; container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.style.border = "2px solid #6c5ce7";
        btn.innerText = (window.currentLang === 'th' ? opt.th : opt.en);
        btn.onclick = () => { stopAllSpeech(); if (opt.action) opt.action(); };
        container.appendChild(btn);
    });
}

document.addEventListener('DOMContentLoaded', initDatabase);
