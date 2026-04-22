/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Legacy Search Logic & Deep Mic Reset)
 * รวมศูนย์ระบบเสียง (TTS) และการรับเสียง (STT) ไว้ที่นี่ที่เดียว
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false; // [NEW] สถานะการฟังจากปุ่มไมค์
window.recognition = null;  // [NEW] ตัวแปร Recognition กลาง

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

// --- 🚩 [NEW] ระบบไมโครโฟน STT (ย้ายมาจาก Index) ---

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = true; 
    window.recognition.interimResults = true; 

    window.recognition.onstart = () => { 
        window.isListening = true;
        updateMicUI(true);
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
                const finalQuery = transcript;
                if (inputField) inputField.value = ''; 
                processQuery(finalQuery);
                window.recognition.stop(); 
            }, 3000); 
        }
    };

    window.recognition.onend = () => { 
        window.isListening = false; // เคลียร์สถานะทุกครั้งที่จบ
        updateMicUI(false); 
        if (typeof startWakeWord === "function" && !window.isBusy && !isAtHome) {
            startWakeWord();
        }
    };

    window.recognition.onerror = (e) => {
    window.isListening = false;
    updateMicUI(false);
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    
    if (e.error === 'audio-capture') {
        console.warn("ไม่พบไมโครโฟน หรือถูกปฏิเสธสิทธิ์");
    }
    console.error("Mic Error:", e.error);
};

function toggleListening() { 
    window.speechSynthesis.cancel(); 
    if (typeof forceStopAllMic === "function") forceStopAllMic(); 
    if (window.micTimer) clearTimeout(window.micTimer);
    
    window.isBusy = false; 

    // 🚀 จุดสำคัญ: ตรวจสอบสถานะก่อนเริ่ม
    if (window.isListening) { 
        try { window.recognition.stop(); } catch(e) {}
    } else { 
        // หน่วงเวลาเล็กน้อยเพื่อให้ตัวเก่า abort เสร็จสมบูรณ์
        setTimeout(() => {
            try {
                if (!window.isListening) { // Double Check
                    window.recognition.start(); 
                }
            } catch (e) { 
                console.warn("Prevented Mic Overlap:", e.message); 
                // หากยัง Error ให้ลองรีเซ็ตสถานะแล้วเริ่มใหม่
                window.isListening = false;
            }
        }, 300);
    } 
}

function updateMicUI(isActive) {
    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');
    if (micBtn) micBtn.classList.toggle('recording', isActive); 
    if (statusText) {
        statusText.innerText = isActive ? 
            (window.currentLang === 'th' ? "กำลังฟัง..." : "Listening...") : 
            (window.currentLang === 'th' ? "แตะไมค์เพื่อเริ่มพูด" : "Tap mic to speak");
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

    // 1. ดัน Progress ไปให้สุดก่อน
    if (progBar) progBar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = 'ระบบพร้อมใช้งานแล้ว';
    
    // 2. ทิ้งช่วงให้คนอ่านสถานะแวบหนึ่ง (600ms)
    setTimeout(() => {
        if (splash) {
            // ใช้การ Transition ทั้งความจาง และการขยายตัว (Scale)
            splash.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
            splash.style.opacity = '0';
            splash.style.transform = 'scale(1.1)'; // หน้าจอจะดูเหมือนลอยห่างออกไป
            splash.style.pointerEvents = 'none'; // ป้องกันการกดทับขณะกำลังจาง

            setTimeout(() => {
                splash.style.display = 'none';
                
                // เริ่มต้นระบบภายใน
                isAtHome = true;
                window.isBusy = false;
                window.hasGreeted = false;
                window.allowWakeWord = false; 

                const homeMsg = (window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                displayResponse(homeMsg);

                renderFAQButtons(); 
                initCamera();       
                initSpeechRecognition(); 
                console.log("🏠 [System] Home screen ready.");
            }, 800); // รอจน Transition จบพอดี
        }
    }, 600);
}

// --- 🚩 ฟังก์ชันกลางสำหรับจัดการสิทธิ์และการเล่นเสียง ---

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 

    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) {}
    }
    if (window.recognition) {
        try { window.recognition.abort(); } catch(e) {}
    }
    updateMicUI(false);
    console.log("🛑 [System] All Microphones Released.");
}

function playAudioLink(url, callback = null) {
    if (!url) return;

    stopAllSpeech(); 
    forceStopAllMic(); 
    if (window.micTimer) clearTimeout(window.micTimer); 
    
    window.isBusy = true;
    updateLottie('talking');

    const audio = new Audio(url);

    audio.onplay = () => {
        forceStopAllMic();
        window.isBusy = true;
    };

    audio.onended = () => {
        setTimeout(() => {
            window.isBusy = false;
            updateLottie('idle');
            updateInteractionTime();
            
            if (callback) {
                callback();
            } else if (window.allowWakeWord && !isAtHome) {
                window.allowWakeWord = true;
                startWakeWord();
            }
        }, 1000); 
    };

    audio.onerror = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
    };

    audio.play().catch(e => { window.isBusy = false; });
}

// --- 1. ระบบจัดการสถานะ & Wake Word Setup ---
function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    if (wakeWordRecognition) { 
        try { wakeWordRecognition.abort(); } catch(e) {} 
    }

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
            isWakeWordActive = false; 
            forceStopAllMic();        
            window.isBusy = true;     

            let msg = "";
            if (window.currentLang === 'th') {
                const affirmations = ["ครับผม", "สวัสดีครับ", "น้องนำทางมาแล้วครับ"];
                const questions = ["มีอะไรให้ช่วยไหมครับ?", "สอบถามข้อมูลได้เลยนะครับ"];
                msg = `${affirmations[Math.floor(Math.random() * affirmations.length)]} ${questions[Math.floor(Math.random() * questions.length)]}`;
            } else {
                msg = "Yes! How can I help you?";
            }
            
            displayResponse(msg);
            setTimeout(() => { speak(msg); }, 300); 
        }
    };

    wakeWordRecognition.onend = () => {
        if (!isAtHome && personInFrameTime !== null && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => {
                try {
                    if (!window.isBusy && !window.isListening && !isAtHome && isWakeWordActive) {
                        wakeWordRecognition.start(); 
                    }
                } catch(e) {}
            }, 1500); 
        } else {
            isWakeWordActive = false;
        }
    };

    wakeWordRecognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
            window.allowWakeWord = false;
            isWakeWordActive = false;
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || isAtHome || window.isListening || window.isMuted || window.isBusy) {
        isWakeWordActive = false;
        return;
    }
    try { 
        forceStopAllMic(); 
        setTimeout(() => {
            isWakeWordActive = true; 
            wakeWordRecognition.start(); 
        }, 200);
    } catch (e) {}
}

function stopWakeWord() {
    isWakeWordActive = false; 
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch (e) {}
    }
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
        const ends = ["มีอะไรให้ช่วยไหมครับ?", "น้องนำทางยินดีให้บริการครับ", "วันนี้รับบริการด้านไหนดีครับ?"];
        finalGreet = `${timeGreet} ${pType}... ${ends[Math.floor(Math.random() * ends.length)]}`;
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

// --- 🚩 4. ระบบประมวลผลคำตอบ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
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
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) return;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim()).filter(k => k !== "");
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                for (const key of keyList) {
                    let score = 0;
                    if (query === key) score = 10.0;
                    else {
                        let simScore = calculateSimilarity(query, key);
                        score = simScore * 5;
                    }
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                }
            });
        }
        if (bestMatch.score >= 0.45 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer); speak(bestMatch.answer); 
        } else { 
            const noDataMsg = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ" : "No info found.";
            displayResponse(noDataMsg); speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { window.isBusy = false; }
}

async function processQuery(query) {
    window.speechSynthesis.cancel();
    const respBox = document.getElementById('response-text');
    if (respBox) respBox.innerText = (window.currentLang === 'th') ? "กำลังค้นหา..." : "Searching...";
    
    // ประมวลผลหาคำตอบ
    await getResponse(query);

    // 🚀 เพิ่มบรรทัดนี้เพื่อล้างข้อความในช่อง Input
    const inputField = document.getElementById('userInput');
    if (inputField) inputField.value = '';
}

// --- 🚩 5. ระบบเสียง (แก้ไขให้ขัดจังหวะได้และเชื่อมต่อ STT) ---

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true; 

    let phoneticText = text.replace(/Smart Queue/gi, "สมาร์ท คิว").replace(/DLT/gi, "ดีแอลที");
    const msg = new SpeechSynthesisUtterance(phoneticText.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    
    msg.onstart = () => { updateLottie('talking'); };
    
    msg.onend = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
        if (callback) callback();

        if (!isAtHome) {
            // 🚀 ปรับการเปิดไมค์อัตโนมัติให้ปลอดภัยขึ้น
            setTimeout(() => {
                if (window.isBusy) return;

                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else {
                    // ตรวจสอบว่าไม่มีการฟังอยู่เดิมก่อนจะเปิด [Auto]
                    if (!window.isListening) {
                        console.log("🎤 [Auto] Safe Opening Mic...");
                        toggleListening(); 

                        if (window.micTimer) clearTimeout(window.micTimer);
                        window.micTimer = setTimeout(() => {
                            if (window.isListening && !window.isBusy) {
                                forceStopAllMic(); 
                                window.allowWakeWord = true;
                                startWakeWord(); 
                            }
                        }, 7000); 
                    }
                }
            }, 1000); // รอให้ระบบ TTS คืนค่า Hardware ครู่หนึ่ง
        }
    };

    msg.onerror = () => { window.isBusy = false; updateLottie('idle'); };
    window.speechSynthesis.speak(msg);
}

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
            else if (opt.s_th) getResponse(window.currentLang === 'th' ? opt.s_th : opt.s_en);
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
    const progBar = document.getElementById('splash-progress-bar');
    let currentWidth = 0;
    
    // --- 🚀 ส่วนที่เพิ่ม: ตัวจำลองการโหลดให้ดูสมูท ---
    // ค่อยๆ เพิ่มเปอร์เซ็นต์หลอกๆ ไปเรื่อยๆ ทุก 200ms
    const progressInterval = setInterval(() => {
        if (currentWidth < 90) { // ให้วิ่งไปรอที่ 90%
            // สุ่มเพิ่มทีละ 1-3% เพื่อให้ดูเหมือนกำลังประมวลผลจริง
            currentWidth += Math.random() * 3; 
            if (progBar) progBar.style.width = currentWidth + '%';
        }
    }, 200);

    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        
        if (json.database) { 
            window.localDatabase = json.database; 
            
            // เมื่อโหลดเสร็จจริง ให้หยุดตัวจำลองแล้วดีดไป 100%
            clearInterval(progressInterval);
            if (progBar) progBar.style.width = '100%';
            
            // รอให้ Transition ของ CSS ทำงานจนสุดแถบ (ประมาณ 600ms) แล้วค่อยเปลี่ยนหน้า
            setTimeout(completeLoading, 600); 
        }
    } catch (e) { 
        console.error("Database Retry...");
        clearInterval(progressInterval); // ล้างค่าก่อนลองใหม่
        setTimeout(initDatabase, 3000); 
    }
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

document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopAllSpeech(); forceStopAllMic(); }
});

window.addEventListener('beforeunload', () => { stopAllSpeech(); forceStopAllMic(); });

document.addEventListener('DOMContentLoaded', initDatabase);
