/**
 * 🚀 สมองกลน้องนำทาง - เวอร์ชั่น Face-API (ตาสับปะรด) + Smart Search สมบูรณ์
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
const IDLE_TIME_LIMIT = 15000; 
let video = document.getElementById('video');
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

// --- 1. ระบบจัดการสถานะ ---
function resetSystemState() {
    stopAllSpeech();
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    if (!isAtHome) restartIdleTimer();
}

document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);

function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.classList.remove('muted');
}

// --- 2. ระบบ Reset หน้าจอ ---
function resetToHome() {
    const now = Date.now();
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer(); 
        return;
    }
    if (isAtHome) return; 

    resetSystemState();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       
    isAtHome = true; 

    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); 
}

// --- 3. ระบบดวงตา AI (Face-API) ---
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => { 
                video.play(); 
                loadFaceModels();
            };
        }
    } catch (err) { console.error("❌ Camera Error:", err); }
}

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
    console.log("✅ [AI] Face Models Ready");
    requestAnimationFrame(detectPerson);
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined') { 
        requestAnimationFrame(detectPerson); 
        return; 
    }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) {
        requestAnimationFrame(detectPerson);
        return;
    }
    lastDetectionTime = now;

    const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
    
    const face = predictions.find(f => {
        const box = f.detection.box;
        const centerX = box.x + (box.width / 2);
        return f.detection.score > 0.70 && box.width > 160 && (centerX > 100 && centerX < 540);
    });

    if (face) {
        if (personInFrameTime === null) personInFrameTime = now;
        window.PersonInFrame = true;
        window.detectedGender = face.gender; 
        const stayDuration = now - personInFrameTime;
        if (stayDuration >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) {
            greetUser(); 
        }
        lastSeenTime = now; 
    } else {
        if (personInFrameTime !== null && (now - lastSeenTime > 2500)) {
            window.PersonInFrame = false; 
            personInFrameTime = null;   
            window.hasGreeted = false;  
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
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

    const greetings = {
        th: [`${timeGreet}${personType} มีอะไรให้น้องนำทางช่วยดูแลไหมครับ?`, `ยินดีให้บริการครับ${personType} สอบถามข้อมูลได้เลยครับ`],
        en: [`${timeGreet}, ${personType}! How can I assist you?`, `Welcome! How can I help you today?`]
    };
    
    const list = greetings[window.currentLang] || greetings['th'];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    
    window.hasGreeted = true; 
    displayResponse(finalGreet);
    speak(finalGreet);
}

// --- 4. ระบบ Search & Log (ดึง Logic ฉลาดๆ มาใส่) ---
async function logQuestionToSheet(userQuery) {
    if (!userQuery || !GAS_URL) return;
    try {
        const finalUrl = `${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`;
        await fetch(finalUrl, { mode: 'no-cors' });
    } catch (e) { console.error(e); }
}

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery);
    isAtHome = false; 
    updateInteractionTime(); 
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");

    try {
        let bestMatch = { answer: "", score: 0, debugKey: "" };

        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            const rows = window.localDatabase[sheetName];
            for (const item of rows) {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) continue;
                
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim()).filter(k => k !== "");
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                
                for (const key of keyList) {
                    let score = 0;
                    const lowerKey = key.toLowerCase();
                    if (query === lowerKey) {
                        score = 10.0;
                    } else {
                        const keyTokens = lowerKey.split(/[\s,/-]+/).filter(t => t.length > 1);
                        let matchCount = 0;
                        keyTokens.forEach(kt => { if (query.includes(kt)) matchCount++; });
                        let tokenScore = keyTokens.length > 0 ? (matchCount / keyTokens.length) : 0;
                        let simScore = calculateSimilarity(query, lowerKey);
                        score = (tokenScore * 5) + (simScore * 1);
                    }

                    if (score > bestMatch.score) {
                        bestMatch = { answer: ans, score: score, debugKey: lowerKey };
                    }
                }
            }
        }

        if (bestMatch.score >= 0.4 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else {
            const fallback = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ ลองเลือกจากหัวข้อด้านล่างนะครับ" : "I couldn't find that. Please try the topics below.";
            displayResponse(fallback);
            speak(fallback);
            renderFAQButtons(); 
        }
    } catch (err) { console.error(err); resetSystemState(); }
}

// --- 5. ระบบเสียง ---
function speak(text) {
    if (!text || window.isMuted) return;
    window.speechSynthesis.cancel();
    
    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { window.isBusy = false; updateLottie('idle'); restartIdleTimer(); };
    
    window.speechSynthesis.speak(msg);
}

function stopAllSpeech() {
    window.speechSynthesis.cancel();
    window.isBusy = false;
    updateLottie('idle');
}

// --- 6. เริ่มต้นระบบ ---
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            renderFAQButtons();
            initCamera(); 
            displayResponse("สวัสดีตอนเช้าครับ ระบบพร้อมให้บริการแล้ว");
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = qText;
            btn.onclick = () => { stopAllSpeech(); getResponse(qText); };
            container.appendChild(btn);
        }
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
    const box = document.getElementById('response-text');
    if (box) box.innerHTML = text.replace(/\n/g, '<br>');
}

// ฟังก์ชันคำนวณความเหมือน (ที่หายไปในโค้ดใหม่)
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

initDatabase();
