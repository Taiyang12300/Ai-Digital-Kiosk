/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Stable Fix)
 * แก้ไขปัญหา Mic Error, สถานะ Busy ทับซ้อน และปรับปรุงการสลับโหมดอัตโนมัติ
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false; 
window.recognition = null;  

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

// --- 🚩 ระบบไมโครโฟน STT (STABLE VERSION) ---

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = false; // ปรับเป็น false เพื่อความแม่นยำในงาน Kiosk
    window.recognition.interimResults = true; 

    window.recognition.onstart = () => { 
        window.isListening = true;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording'); 
        const statusText = document.getElementById('statusText');
        if (statusText) statusText.innerText = (window.currentLang === 'th') ? "กำลังฟัง..." : "Listening...";
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
                try { window.recognition.stop(); } catch(err) {} 
            }, 1800); 
        }
    };

    window.recognition.onend = () => { 
        stopListening(); 
        // สลับกลับไป Wake Word เฉพาะเมื่อไม่ได้ยุ่งและอยู่นอกหน้า Home
        setTimeout(() => {
            if (!window.isBusy && !isAtHome && window.allowWakeWord && !window.isListening) {
                startWakeWord();
            }
        }, 500);
    };

    window.recognition.onerror = (e) => {
        if (e.error === 'no-speech') return;
        console.error("Mic Error:", e.error);
        stopListening();
    };
}

function toggleListening() { 
    window.speechSynthesis.cancel(); 
    
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => { a.pause(); a.currentTime = 0; });

    if (window.micTimer) clearTimeout(window.micTimer);
    
    // หากกำลังฟังอยู่ ให้หยุด
    if (window.isListening) { 
        forceStopAllMic();
        return;
    } 

    window.isBusy = false; 
    stopWakeWord(); // ปิด Wake Word ก่อนเริ่ม STT

    try {
        if (window.recognition) {
            window.recognition.start(); 
        }
    } catch (e) { 
        console.warn("Mic Start Error - Attempting Reset...");
        if (window.recognition) window.recognition.abort();
        window.isListening = false;
    } 
}

function stopListening() { 
    window.isListening = false;
    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');
    if (micBtn) micBtn.classList.remove('recording'); 
    if (statusText) statusText.innerText = (window.currentLang === 'th') ? "แตะไมค์เพื่อเริ่มพูด" : "Tap mic to speak";
}

// --- 🚩 ฟังก์ชันควบคุม Splash Screen ---
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
                initSpeechRecognition(); 
                console.log("🏠 [System] Home screen ready.");
            }, 800);
        }
    }, 500);
}

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    stopListening();
    console.log("🛑 [System] All Microphones Released.");
}

function playAudioLink(url, callback = null) {
    if (!url) return;
    stopAllSpeech(); 
    forceStopAllMic(); 
    window.isBusy = true;
    updateLottie('talking');

    const audio = new Audio(url);
    audio.onplay = () => { window.isBusy = true; };
    audio.onended = () => {
        setTimeout(() => {
            window.isBusy = false;
            updateLottie('idle');
            updateInteractionTime();
            if (callback) callback();
            else if (window.allowWakeWord && !isAtHome) startWakeWord();
        }, 1200);
    };
    audio.play().catch(e => { window.isBusy = false; });
}

// --- 1. ระบบจัดการสถานะ & Wake Word ---
function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }

    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        if (!window.allowWakeWord || window.isBusy || window.isListening) return;
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) { transcript += event.results[i][0].transcript; }

        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            stopWakeWord();        
            window.isBusy = true;     
            let msg = (window.currentLang === 'th') ? "ครับผม มีอะไรให้ช่วยไหมครับ?" : "Yes! How can I help you?";
            displayResponse(msg);
            setTimeout(() => { speak(msg); }, 300); 
        }
    };

    wakeWordRecognition.onend = () => {
        if (!isAtHome && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => { 
                try { if(isWakeWordActive) wakeWordRecognition.start(); } catch(e) {} 
            }, 1000);
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || isAtHome || window.isListening || window.isBusy) return;
    isWakeWordActive = true;
    try { wakeWordRecognition.start(); } catch (e) {}
}

function stopWakeWord() {
    isWakeWordActive = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch (e) {} }
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

    const now = new Date();
    const hour = now.getHours();
    const gender = window.detectedGender || 'male';

    let finalGreet = "";
    if (window.currentLang === 'th') {
        let timeGreet = hour < 12 ? "สวัสดีตอนเช้าครับ" : hour === 12 ? "สวัสดีตอนเที่ยงครับ" : hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ";
        const pType = (gender === 'male') ? "คุณผู้ชาย" : "คุณผู้หญิง";
        finalGreet = `${timeGreet} ${pType} มีอะไรให้น้องนำทางช่วยไหมครับ?`;
    } else {
        finalGreet = `Hello ${gender === 'male' ? 'Sir' : 'Madam'}, how can I help you?`;
    }

    displayResponse(finalGreet);
    speak(finalGreet, () => { 
        window.isBusy = false; 
        window.allowWakeWord = true; 
    }, true); 
}

// --- 🚩 3. ระบบคัดกรองใบขับขี่ ---
function startLicenseCheck(type) {
    forceStopAllMic(); isAtHome = false;
    const msg = window.currentLang === 'th' ? `ใบขับขี่ ${type} หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    displayResponse(msg);
    speak(msg, () => { window.isBusy = false; });
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", en: "Under 1 year", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ เกิน 1 ปี (ไม่เกิน 3 ปี)", en: "1-3 years", action: () => showLicenseChecklist(type, 'over1') },
        { th: "❌ เกิน 3 ปี", en: "Over 3 years", action: () => showLicenseChecklist(type, 'over3') }
    ]);
}

function showLicenseChecklist(type, expiry) {
    const isThai = window.currentLang === 'th';
    const isTemp = type.includes("ชั่วคราว");
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = (expiry === 'normal') ? "ต่อได้ทันที" : "ต้องสอบข้อเขียนใหม่";
    
    let checklistHTML = "";
    docs.forEach((d, idx) => {
        checklistHTML += `<div class="check-item"><input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()"><label for="chk-${idx}">${d}</label></div>`;
    });
    const resultHTML = `<div class="checklist-card"><strong>${type}</strong><br><small>💡 ${note}</small><hr>${checklistHTML}<button id="btnPrintGuide" style="display:none;" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}'); resetToHome();">🖨️ ปริ้นใบนำทาง</button></div>`;
    displayResponse(resultHTML);
    speak(isThai ? "กรุณาตรวจสอบเอกสารและปริ้นใบนำทางครับ" : "Please check items and print.");
}

function checkChecklist() {
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    const allChecked = Array.from(checks).every(c => c.checked);
    if (printBtn) printBtn.style.display = allChecked ? 'block' : 'none';
}

// --- 🚩 4. ระบบประมวลผลคำตอบ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    stopAllSpeech();
    forceStopAllMic();
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();
    if ((query.includes("ใบขับขี่") || query.includes("ต่อ")) && !query.includes("2 ปี") && !query.includes("5 ปี")) {
        const askMsg = (window.currentLang === 'th') ? "ใบขับขี่เป็นแบบ 2 ปี หรือ 5 ปีครับ?" : "Is it 2 or 5 years?";
        displayResponse(askMsg); speak(askMsg);
        renderOptionButtons([
            { th: "แบบ 2 ปี", en: "2 years", action: () => startLicenseCheck("ชั่วคราว (2 ปี)") },
            { th: "แบบ 5 ปี", en: "5 years", action: () => startLicenseCheck("5 ปี") }
        ]);
        return;
    }

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                for (const key of keyList) {
                    let simScore = calculateSimilarity(query, key);
                    if (simScore > bestMatch.score) bestMatch = { answer: ans, score: simScore };
                }
            });
        }
        if (bestMatch.score >= 0.6) { displayResponse(bestMatch.answer); speak(bestMatch.answer); }
        else { 
            const noData = window.currentLang === 'th' ? "ขออภัยครับ ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่" : "No info found.";
            displayResponse(noData); speak(noData);
            setTimeout(renderFAQButtons, 4000);
        }
    } catch (err) { window.isBusy = false; }
}

async function processQuery(query) {
    window.speechSynthesis.cancel();
    const respBox = document.getElementById('response-text');
    if (respBox) respBox.innerText = "...";
    await getResponse(query);
}

// --- 🚩 5. ระบบเสียง (Stable Sync) ---
function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true; 

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'th-TH';
    msg.rate = 1.1;
    
    msg.onstart = () => { updateLottie('talking'); };
    msg.onend = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
        if (callback) callback();

        if (!isAtHome) {
            setTimeout(() => {
                if (window.isBusy || window.isListening) return;
                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else {
                    toggleListening(); // เปิดไมค์รับคำสั่งต่อทันทีหลังตอบ
                }
            }, 1000); 
        }
    };
    window.speechSynthesis.speak(msg);
}

function stopAllSpeech() { window.speechSynthesis.cancel(); window.isBusy = false; updateLottie('idle'); }

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText;
            btn.onclick = () => { getResponse(qText); };
            container.appendChild(btn);
        }
    });
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return; container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button'); btn.className = 'faq-btn';
        btn.innerText = (window.currentLang === 'th' ? opt.th : opt.en);
        btn.onclick = () => { if (opt.action) opt.action(); };
        container.appendChild(btn);
    });
}

function calculateSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
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
        if (json.database) { 
            window.localDatabase = json.database; 
            completeLoading(); 
        }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { 
            video.srcObject = stream; 
            video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; 
        }
    } catch (err) { console.error("❌ Camera Error"); }
}

document.addEventListener('DOMContentLoaded', initDatabase);
