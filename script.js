/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Stable Mic Control)
 * แก้ไข: ปรับระบบหยุด Wake Word ให้เด็ดขาดก่อนเปิดไมค์หลัก เพื่อแก้ปัญหาปุ่มกดไม่ติด
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
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

// --- 1. ระบบจัดการสถานะ & Wake Word Setup ---

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = false;
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (window.isBusy || isListeningNow) return;

        const lastResultIndex = event.results.length - 1;
        const text = event.results[lastResultIndex][0].transcript.trim().toLowerCase();
        console.log("👂 WakeWord Detected:", text);

        if (text.includes("น้องนำทาง") || text.includes("สวัสดีน้องนำทาง")) {
            stopWakeWord(); 

            const responses = window.currentLang === 'th' 
                ? ["ครับผม", "ครับผม มีอะไรให้ช่วยไหมครับ", "สวัสดีครับ สอบถามข้อมูลได้เลยครับ"]
                : ["Yes!", "I'm listening. How can I help you?", "Hello! What would you like to know?"];
            
            const msg = responses[Math.floor(Math.random() * responses.length)];
            displayResponse(msg);

            speak(msg, () => {
                // เคลียร์ Busy ก่อนสั่งไมค์หลัก
                window.isBusy = false;
                setTimeout(() => {
                    if (typeof toggleListening === "function") {
                        console.log("🎤 [Auto] Triggering Main Mic...");
                        toggleListening(); 
                    }
                }, 100);
            });
        }
    };

    wakeWordRecognition.onend = () => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (isWakeWordActive && !window.isBusy && !isListeningNow && personInFrameTime !== null) {
            try { wakeWordRecognition.start(); } catch(e) {}
        }
    };
}

// 🚩 ฟังก์ชันสำหรับปุ่มไมค์ (Manual Override)
async function handleMicButtonClick() {
    console.log("🖱️ [Manual] Mic Button Triggered");
    
    // 1. หยุดระบบแอบฟังแบบเด็ดขาด
    isWakeWordActive = false; 
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) { console.log("Abort Error:", e); }
    }

    // 2. หยุดเสียงพูดที่ค้างอยู่
    window.speechSynthesis.cancel(); 
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);

    // 3. ปลดล็อคสถานะ Busy
    window.isBusy = false; 
    
    // 4. รอให้ Browser เคลียร์คิวไมโครโฟนสักครู่ (150ms) แล้วค่อยเปิดไมค์หลัก
    setTimeout(() => {
        if (typeof toggleListening === "function") {
            try {
                toggleListening();
                console.log("🎤 [Manual] Main Mic Started Successfully");
            } catch (err) {
                console.error("🎤 [Manual] Cannot start Main Mic:", err);
            }
        }
    }, 150);
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
    // ถ้าไมค์หลักทำงานอยู่ ห้ามเริ่มแอบฟัง
    if (isWakeWordActive || isListeningNow || window.isMuted || window.isBusy) return;
    try {
        wakeWordRecognition.start();
        isWakeWordActive = true;
        console.log("🎤 [System] Wake Word Standby...");
    } catch (e) {}
}

function stopWakeWord() {
    isWakeWordActive = false;
    if (!wakeWordRecognition) return;
    try {
        wakeWordRecognition.abort(); 
        console.log("🔇 [System] Wake Word Aborted");
    } catch (e) {}
}

// --- ฟังก์ชันอื่นๆ คงเดิมตามตรรกะของพี่ ---

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
    } catch (e) { console.error("❌ [Log Error]:", e); }
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

    console.log("🏠 [Reset] Returning to Home.");
    stopAllSpeech(); 
    stopWakeWord(); 
    forceUnmute(); 
    
    window.hasGreeted = false;      
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

// --- Face Detection & Greetings ---

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        console.log("✅ โหลดโมเดล AI สำเร็จ");
        setupWakeWord(); 
        requestAnimationFrame(detectPerson);
    } catch (err) { console.error("❌ โมเดล AI โหลดไม่สำเร็จ"); }
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

            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) {
                greetUser();
            }
            lastSeenTime = now; 
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 3000)) {
                personInFrameTime = null;   
                window.hasGreeted = false;  
                stopWakeWord(); 
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
    const hour = new Date().getHours();
    const isThai = window.currentLang === 'th';
    const gender = window.detectedGender || 'male';

    let timeGreet = isThai 
        ? (hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ"))
        : (hour < 12 ? "Good morning" : (hour < 17 ? "Good afternoon" : "Good evening"));

    let personType = isThai 
        ? (gender === 'male' ? "คุณผู้ชาย" : "คุณผู้หญิง")
        : (gender === 'male' ? "Sir" : "Madam");

    const greetingsTh = [`${timeGreet}${personType} สอบถามผมได้นะครับ`, `สวัสดีครับ ผมน้องนำทาง ยินดีให้บริการครับ`, `${timeGreet} ต้องการให้น้องช่วยเรื่องอะไรมั้ยครับ` ];
    const greetingsEn = [`${timeGreet}, ${personType}! You can call my name to ask anything.`, `Welcome! I'm Nong Nam Thang. Just call my name.`, `Hello! Feel free to call "Nong Nam Thang" for assistance.` ];

    const list = isThai ? greetingsTh : greetingsEn;
    const finalGreet = list[Math.floor(Math.random() * list.length)];

    window.hasGreeted = true; 
    displayResponse(finalGreet);
    speak(finalGreet, () => {
        startWakeWord();
    });
}

// --- Logic Response & Search ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();
    if ((query.includes("ใบขับขี่") || query.includes("license")) && (query.includes("ต่อ") || query.includes("renew"))) {
        if (!query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
            const askMsg = (window.currentLang === 'th') ? "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is it Temporary or 5-year?";
            displayResponse(askMsg); speak(askMsg);
            renderOptionButtons([
                { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
                { th: "แบบ 5 ปี", en: "5-year type", action: () => startLicenseCheck("แบบ 5 ปี") }
            ]);
            window.isBusy = false; return;
        }
    }

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const key = item[0] ? item[0].toString().toLowerCase() : "";
                if (!key) return;
                let simScore = calculateSimilarity(query, key);
                let currentScore = key.includes(query) ? 1.0 : simScore;
                if (currentScore > 0.6 && currentScore > bestMatch.score) {
                    bestMatch = { answer: (window.currentLang === 'th' ? item[1] : item[2] || item[1]), score: currentScore };
                }
            });
        }
        if (bestMatch.score > 0) { displayResponse(bestMatch.answer); speak(bestMatch.answer); } 
        else { 
            const noDataMsg = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่ที่เคาท์เตอร์นะครับ" : "No info found.";
            displayResponse(noDataMsg); 
            speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { window.isBusy = false; }
}

// --- Voice & Speech ---

function speak(text, callback = null) {
    if (!text || window.isMuted) return;
    
    stopWakeWord(); 
    window.speechSynthesis.cancel();

    const safetyTime = (text.length * 200) + 5000;
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    
    speechSafetyTimeout = setTimeout(() => {
        if (window.isBusy) { 
            window.isBusy = false; 
            updateLottie('idle'); 
            if (callback) callback();
        }
    }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    const voices = window.speechSynthesis.getVoices();
    if (window.currentLang === 'th') {
        msg.lang = 'th-TH';
        const googleThai = voices.find(v => v.name.includes('Google') && v.lang.includes('th'));
        if (googleThai) msg.voice = googleThai;
    }

    msg.rate = 1.05;
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { 
        if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
        window.isBusy = false; 
        updateLottie('idle'); 
        updateInteractionTime(); 
        if (callback) callback();
        else if (personInFrameTime !== null) setTimeout(startWakeWord, 500); 
    };
    window.speechSynthesis.speak(msg);
}

// Helper Functions
window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
function stopAllSpeech() { window.speechSynthesis.cancel(); if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout); window.isBusy = false; updateLottie('idle'); }
function changeLanguage(lang) { window.currentLang = lang; isAtHome = true; window.hasGreeted = false; personInFrameTime = null; renderFAQButtons(); }
function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText;
            btn.onclick = () => { stopAllSpeech(); getResponse(qText); };
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
        if (json.database) { window.localDatabase = json.database; renderFAQButtons(); initCamera(); displayResponse("สวัสดีครับ กดปุ่มไมค์หรือเรียกชื่อน้องนำทางเพื่อสอบถามได้เลยครับ"); }
    } catch (e) { setTimeout(initDatabase, 5000); }
}
async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; }
    } catch (err) { console.error("❌ Camera Error"); }
}
initDatabase();
