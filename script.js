/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Legacy Search Logic & Deep Mic Reset)
 * ปรับปรุง: นำระบบคำนวณคะแนนที่แม่นยำ (Token Score + Year Bonus) กลับมาใช้
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

// --- 🚩 ฟังก์ชันกลางสำหรับจัดการสิทธิ์และการเล่นเสียง ---

function forceStopAllMic() {
    isWakeWordActive = false;
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
    updateLottie('talking');
    const audio = new Audio(url);
    audio.onended = () => {
        window.isBusy = false;
        updateLottie('idle');
        updateInteractionTime();
        if (callback) callback();
        else if (window.allowWakeWord && !isAtHome) setTimeout(startWakeWord, 1000);
    };
    audio.onerror = () => { window.isBusy = false; updateLottie('idle'); };
    audio.play().catch(e => { window.isBusy = false; });
}

// --- 1. ระบบจัดการสถานะ & Wake Word Setup ---

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }

    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = false;
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (!window.allowWakeWord || window.isBusy || isListeningNow) return;
        const lastResultIndex = event.results.length - 1;
        const text = event.results[lastResultIndex][0].transcript.trim();
        if (text.includes("น้องนำทาง") || text.includes("สวัสดีน้องนำทาง")) {
            stopWakeWord(); 
            window.isBusy = true;
            const responses = window.currentLang === 'th' ? ["ครับผม", "สวัสดีครับ มีอะไรให้น้องช่วยไหมครับ"] : ["Yes!", "Hello!"];
            const msg = responses[Math.floor(Math.random() * responses.length)];
            displayResponse(msg);
            speak(msg, () => {
                window.isBusy = false; 
                setTimeout(() => { if (typeof toggleListening === "function") toggleListening(); }, 200);
            });
        }
    };

    wakeWordRecognition.onend = () => {
        setTimeout(() => {
            const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
            if (window.allowWakeWord && isWakeWordActive && !window.isBusy && !isListeningNow && personInFrameTime !== null) {
                try { wakeWordRecognition.start(); } catch(e) {}
            }
        }, 1000);
    };
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
    if (!window.allowWakeWord || isAtHome || isListeningNow || window.isMuted || window.isBusy) {
        isWakeWordActive = false;
        return;
    }
    try { isWakeWordActive = true; wakeWordRecognition.start(); } catch (e) {}
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
    stopWakeWord(); 
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
                personInFrameTime = null;   window.hasGreeted = false; window.allowWakeWord = false; stopWakeWord(); 
                if (!isAtHome) restartIdleTimer();
            }
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    forceUnmute(); isAtHome = false; window.hasGreeted = true; window.isBusy = true; 
    const hour = new Date().getHours();
    const isThai = window.currentLang === 'th';
    const gender = window.detectedGender || 'male';
    let timeGreet = isThai ? (hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ")) : (hour < 12 ? "Good morning" : (hour < 17 ? "Good afternoon" : "Good evening"));
    let personType = isThai ? (gender === 'male' ? "คุณผู้ชาย" : "คุณผู้หญิง") : (gender === 'male' ? "Sir" : "Madam");
    const greetingsTh = [`${timeGreet}${personType} สอบถามผมได้นะครับ`, `สวัสดีครับ ผมน้องนำทาง ยินดีให้บริการครับ` ];
    const greetingsEn = [`Welcome! I'm Nong Nam Thang. Just call my name.`];
    const list = isThai ? greetingsTh : greetingsEn;
    const finalGreet = list[Math.floor(Math.random() * list.length)];
    displayResponse(finalGreet);
    speak(finalGreet, () => { window.isBusy = false; window.allowWakeWord = true; startWakeWord(); });
}

// --- 🚩 3. ระบบคัดกรองใบขับขี่ ---

function startLicenseCheck(type) {
    forceStopAllMic(); isAtHome = false;
    const isThai = window.currentLang === 'th';
    const msg = isThai ? `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?` : `Is your ${type} license expired?`;
    displayResponse(msg);
    speak(msg, () => { window.isBusy = false; });
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", en: "Not expired / Under 1 year", s_th: `ต่อใบขับขี่ ${type}`, s_en: `renew ${type} license`, action: () => { forceStopAllMic(); showLicenseChecklist(type, 'normal'); } },
        { th: "⚠️ หมดอายุเกิน 1 ปี (แต่ไม่เกิน 3 ปี)", en: "Expired 1-3 years", s_th: `ต่อใบขับขี่ ${type} เกิน 1 ปี`, s_en: `renew ${type} over 1 year`, action: () => { forceStopAllMic(); showLicenseChecklist(type, 'over1'); } },
        { th: "❌ หมดอายุเกิน 3 ปี", en: "Expired over 3 years", s_th: `ต่อใบขับขี่ ${type} เกิน 3 ปี`, s_en: `renew ${type} over 3 year`, action: () => { forceStopAllMic(); showLicenseChecklist(type, 'over3'); } }
    ]);
}

function showLicenseChecklist(type, expiry) {
    const isThai = window.currentLang === 'th';
    const isTemp = type.includes("ชั่วคราว") || type.includes("2 ปี");
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = "";
    if (isTemp) {
        if (expiry === 'normal') note = "ไม่ต้องอบรม ต่อได้ทันที";
        else if (expiry === 'over1') note = "อบรมสำนักงาน 5 ชั่วโมง และสอบข้อเขียนใหม่";
        else if (expiry === 'over3') note = "อบรมสำนักงาน 5 ชั่วโมง สอบข้อเขียนและสอบขับรถใหม่";
    } else {
        if (expiry === 'normal') { docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); note = "อบรมออนไลน์ 1 ชม. และต่อได้ทันที"; }
        else if (expiry === 'over1') { docs.push("ผลผ่านการอบรมออนไลน์ (DLT e-Learning)"); note = "อบรมออนไลน์ 2 ชม. และต้องสอบข้อเขียนใหม่"; }
        else if (expiry === 'over3') { note = "ต้องอบรม 5 ชม. ที่ขนส่งเท่านั้น + สอบข้อเขียน + สอบขับรถ"; }
    }
    let checklistHTML = "";
    docs.forEach((d, idx) => {
        checklistHTML += `<div class="check-item" onclick="document.getElementById('chk-${idx}').click()"><input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" onclick="event.stopPropagation()"><label>${d}</label></div>`;
    });
    const resultHTML = `<div class="checklist-card"><strong style="font-size:22px;">${type}</strong><br><div style="background:#e8f0fe; color:#1a73e8; padding:8px; border-radius:5px; margin-top:5px; font-weight:bold;">💡 ${note}</div><hr style="margin:15px 0; border:0; border-top:1px solid #eee;">${checklistHTML}<button id="btnPrintGuide" style="display:none;" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}'); setTimeout(() => { resetToHome(); }, 2000);">🖨️ ปริ้นใบนำทาง</button></div>`;
    displayResponse(resultHTML);
    speak(isThai ? "กรุณาติ๊กตรวจสอบเอกสารให้ครบ เพื่อปริ้นใบนำทางครับ" : "Please check all items to print.");
}

function checkChecklist() {
    updateInteractionTime(); 
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    if (allChecked) { printBtn.classList.add('show-btn'); printBtn.style.setProperty('display', 'block', 'important'); }
    else { printBtn.classList.remove('show-btn'); printBtn.style.setProperty('display', 'none', 'important'); }
}

// --- 🚩 4. ระบบประมวลผลคำตอบ (Smart Search Logic - ปรับปรุงใหม่) ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");

    // [1. คัดกรองคำถามกว้างเรื่องใบขับขี่]
    const isLicense = query.includes("ใบขับขี่") || query.includes("license");
    const isRenew = query.includes("ต่อ") || query.includes("renew");

    if (isLicense && isRenew && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        forceStopAllMic(); 
        const askMsg = (window.currentLang === 'th') ? "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is it Temporary or 5-year?";
        displayResponse(askMsg); 
        speak(askMsg, () => { window.isBusy = false; });
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", s_th: "ต่อใบขับขี่ชั่วคราว", s_en: "renew temporary license", action: () => { forceStopAllMic(); startLicenseCheck("แบบชั่วคราว (2 ปี)"); } },
            { th: "แบบ 5 ปี", en: "5-year type", s_th: "ต่อใบขับขี่ 5 ปี เป็น 5 ปี", s_en: "renew 5 year license", action: () => { forceStopAllMic(); startLicenseCheck("แบบ 5 ปี"); } }
        ]);
        return;
    }

    try {
        let bestMatch = { answer: "", score: 0, debugKey: "" };
        
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) return;
                
                // รองรับ Multi-Keyword (แยกด้วยคอมม่าหรือขึ้นบรรทัดใหม่)
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim()).filter(k => k !== "");
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                
                for (const key of keyList) {
                    let score = 0;
                    const lowerKey = key.toLowerCase();
                    
                    if (query === lowerKey) {
                        score = 10.0; // ตรงกันเป๊ะ
                    } else {
                        // 🚩 Legacy Logic: Token Score + Similarity
                        const keyTokens = lowerKey.split(/[\s,/-]+/).filter(t => t.length > 1);
                        let matchCount = 0;
                        keyTokens.forEach(kt => { if (query.includes(kt)) matchCount++; });
                        
                        let tokenScore = keyTokens.length > 0 ? (matchCount / keyTokens.length) : 0;
                        let simScore = calculateSimilarity(query, lowerKey);

                        // 🚩 Legacy Logic: Year Bonus
                        let yearBonus = 0;
                        const isQ5 = query.includes("5 ปี") || query.includes("5ปี");
                        const isQ2 = query.includes("2 ปี") || query.includes("2ปี") || query.includes("ชั่วคราว");
                        const isK5 = lowerKey.includes("5 ปี") || lowerKey.includes("5ปี");
                        const isK2 = lowerKey.includes("2 ปี") || lowerKey.includes("2ปี") || lowerKey.includes("ชั่วคราว");

                        if (isQ5 && isK5) yearBonus = 2.0;
                        if (isQ2 && isK2) yearBonus = 2.0;
                        if ((isQ5 && isK2) || (isQ2 && isK5)) yearBonus = -5.0;

                        score = (tokenScore * 5) + (simScore * 1) + yearBonus;
                    }

                    if (score > bestMatch.score) {
                        bestMatch = { answer: ans, score: score, debugKey: lowerKey };
                    }
                }
            });
        }

        if (bestMatch.score >= 0.45 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer); 
            speak(bestMatch.answer); 
        } else { 
            const noDataMsg = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ" : "No info found.";
            displayResponse(noDataMsg); 
            speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { window.isBusy = false; }
}

// --- 5. ระบบเสียง (Google Voice) ---

function speak(text, callback = null) {
    if (!text || window.isMuted) return;
    stopWakeWord(); 
    window.speechSynthesis.cancel();
    window.isBusy = true;
    const safetyTime = (text.length * 200) + 5000;
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    speechSafetyTimeout = setTimeout(() => { if (window.isBusy) { window.isBusy = false; updateLottie('idle'); if (callback) callback(); } }, safetyTime);

    // แก้คำทับศัพท์
    let cleanText = text.replace(/Queue/gi, "คิว").replace(/DLT/gi, "ดีแอลที").replace(/Smart/gi, "สมาร์ท");
    const msg = new SpeechSynthesisUtterance(cleanText.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    const voices = window.speechSynthesis.getVoices();
    if (window.currentLang === 'th') {
        msg.lang = 'th-TH';
        const googleThai = voices.find(v => v.name.includes('Google') && v.lang.includes('th'));
        if (googleThai) msg.voice = googleThai;
    }
    msg.rate = 1.05;
    msg.onstart = () => { updateLottie('talking'); };
    msg.onend = () => { 
        if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
        window.isBusy = false; updateLottie('idle'); updateInteractionTime(); 
        if (callback) callback();
        else if (window.allowWakeWord && !isAtHome) {
            const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
            if (!isListeningNow) setTimeout(startWakeWord, 1000); 
        }
    };
    window.speechSynthesis.speak(msg);
}

window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
function stopAllSpeech() { window.speechSynthesis.cancel(); if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout); window.isBusy = false; updateLottie('idle'); }

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
        btn.onclick = () => { 
            stopAllSpeech(); 
            window.isBusy = false; 
            if (opt.action) opt.action(); 
            else if (opt.s_th) {
                const query = (window.currentLang === 'th') ? opt.s_th : (opt.s_en || opt.s_th);
                getResponse(query);
            }
        };
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
        if (json.database) { 
            window.localDatabase = json.database; 
            renderFAQButtons(); 
            initCamera(); 
            isAtHome = false; 
            resetToHome(); 
        }
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
