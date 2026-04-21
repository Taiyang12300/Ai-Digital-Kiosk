/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Stable Full Release)
 * เชื่อมต่อกับ HTML: รองรับการแสดงผลปุ่มปริ้นผ่าน class 'show-btn'
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

// --- 🚩 ระบบไมโครโฟน STT ---

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = false; 
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
        setTimeout(() => {
            if (!window.isBusy && !isAtHome && window.allowWakeWord && !window.isListening) {
                startWakeWord();
            }
        }, 500);
    };

    window.recognition.onerror = (e) => {
        if (e.error === 'no-speech') return;
        stopListening();
    };
}

function toggleListening() { 
    window.speechSynthesis.cancel(); 
    if (window.micTimer) clearTimeout(window.micTimer);
    
    if (window.isListening) { 
        forceStopAllMic();
        return;
    } 

    window.isBusy = false; 
    stopWakeWord(); 

    try {
        if (window.recognition) window.recognition.start(); 
    } catch (e) { 
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

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    stopListening();
}

// --- 🚩 ระบบคัดกรองใบขับขี่ & ปุ่มปริ้น (เชื่อมต่อกับ HTML CSS) ---

function showLicenseChecklist(type, expiry) {
    const isThai = window.currentLang === 'th';
    const isTemp = type.includes("ชั่วคราว") || type.includes("2 ปี");
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = "";

    if (isTemp) {
        if (expiry === 'normal') note = "ไม่ต้องอบรม ต่อได้ทันที";
        else if (expiry === 'over1') note = "อบรม 5 ชม. และสอบข้อเขียนใหม่";
        else if (expiry === 'over3') note = "อบรม 5 ชม. สอบข้อเขียนและขับรถใหม่";
    } else {
        if (expiry === 'normal') { docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); note = "อบรมออนไลน์ 1 ชม. และต่อได้ทันที"; }
        else if (expiry === 'over1') { docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); note = "อบรมออนไลน์ 2 ชม. และต้องสอบข้อเขียนใหม่"; }
        else if (expiry === 'over3') { note = "อบรม 5 ชม. ที่ขนส่งเท่านั้น + สอบข้อเขียน + สอบขับรถ"; }
    }

    let checklistHTML = "";
    docs.forEach((d, idx) => {
        // ใช้ class 'check-item' ตาม CSS ใน HTML ของคุณ
        checklistHTML += `
            <div class="check-item" onclick="const c = document.getElementById('chk-${idx}'); c.checked = !c.checked; checkChecklist();">
                <input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" onclick="event.stopPropagation()">
                <label>${d}</label>
            </div>`;
    });

    const resultHTML = `
        <div class="checklist-card">
            <strong style="font-size:22px; color:#6c5ce7;">${type}</strong><br>
            <div style="background:#f0edff; color:#6c5ce7; padding:10px; border-radius:8px; margin:10px 0; font-weight:bold;">💡 ${note}</div>
            <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
            ${checklistHTML}
            <button id="btnPrintGuide" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}');">
                🖨️ ปริ้นใบนำทาง
            </button>
        </div>`;

    displayResponse(resultHTML);
    speak(isThai ? "กรุณาตรวจสอบเอกสารให้ครบ เพื่อปริ้นใบนำทางครับ" : "Please check all items to print.");
}

function checkChecklist() {
    updateInteractionTime(); 
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    
    // ใช้ class 'show-btn' ตามที่คุณเขียนไว้ใน <style> ของ HTML
    if (allChecked) {
        printBtn.classList.add('show-btn');
    } else {
        printBtn.classList.remove('show-btn');
    }
}

// --- 🚩 ระบบจัดการหน้าจอ & ฐานข้อมูล ---

async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    if (progBar) progBar.style.width = '30%'; 
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            if (progBar) progBar.style.width = '100%';
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
            isAtHome = true;
            initCamera();       
            initSpeechRecognition(); 
            displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
            renderFAQButtons(); 
        }, 800);
    }
}

// --- 🚩 ระบบประมวลผลคำตอบ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    stopAllSpeech();
    forceStopAllMic();
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();
    
    // คัดกรองเคสใบขับขี่
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

function startLicenseCheck(type) {
    const isThai = window.currentLang === 'th';
    const msg = isThai ? `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    displayResponse(msg);
    speak(msg, () => { window.isBusy = false; });
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", en: "Not expired / Under 1 year", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ หมดอายุเกิน 1 ปี", en: "Expired over 1 year", action: () => showLicenseChecklist(type, 'over1') },
        { th: "❌ หมดอายุเกิน 3 ปี", en: "Expired over 3 years", action: () => showLicenseChecklist(type, 'over3') }
    ]);
}

// --- ฟังก์ชันเสริม (Helper) ---

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
                if (isGreeting) { window.allowWakeWord = true; startWakeWord(); }
                else { toggleListening(); }
            }, 1000); 
        }
    };
    window.speechSynthesis.speak(msg);
}

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

function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }
function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); }
function resetToHome() { if (window.isBusy || !isAtHome) return; isAtHome = true; window.hasGreeted = false; forceStopAllMic(); displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone."); renderFAQButtons(); }

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; }
    } catch (err) {}
}

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        setupWakeWord(); 
        requestAnimationFrame(detectPerson);
    } catch (err) {}
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = predictions.find(f => f.detection.score > 0.55);
        if (face) {
            if (personInFrameTime === null) personInFrameTime = now;
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) { greetUser(); }
            lastSeenTime = now; 
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    isAtHome = false; window.hasGreeted = true; 
    let finalGreet = "สวัสดีครับ มีอะไรให้น้องนำทางช่วยไหมครับ?";
    displayResponse(finalGreet);
    speak(finalGreet, () => { window.isBusy = false; window.allowWakeWord = true; }, true); 
}

function stopAllSpeech() { window.speechSynthesis.cancel(); window.isBusy = false; updateLottie('idle'); }

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.lang = 'th-TH';
    wakeWordRecognition.onresult = (event) => {
        let transcript = event.results[event.results.length - 1][0].transcript;
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            stopWakeWord();
            speak("ครับผม มีอะไรให้ช่วยไหมครับ?");
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

async function logQuestionToSheet(userQuery) {
    if (!userQuery || !GAS_URL) return;
    try { await fetch(`${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`, { mode: 'no-cors' }); } catch (e) {}
}

document.addEventListener('DOMContentLoaded', initDatabase);
