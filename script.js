/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Legacy Search Logic & Deep Mic Reset)
 * แก้ไข: การเปิด-ปิดไมค์ให้สัมพันธ์กับสถานะการพูด (Speak = Stop / End = Start)
 * ปรับปรุง: เสถียรภาพการสลับโหมดไมค์ และระบบ Loading Screen
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false;
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
window.recognition = null; // 🔥 สำคัญ ต้องมี
let wakeWordRecognition = null;
const DETECTION_INTERVAL = 200; 

let manualMicOverride = false;
let micHardLock = false;
let lastFinalTranscript = "";
let isSubmitting = false;
let micSessionId = 0;
let isWakeWordActive = false;

function safeStartRecognition() {
    if (!window.recognition) initSpeechRecognition();
    if (!window.recognition) return;

    if (window.isListening) return;

    try {
        window.recognition.start();
    } catch (e) {
        console.warn("Start fail:", e);
    }
}

// ================= SAFE STOP =================
function safeStopRecognition() {
    if (!window.recognition) return;

    try {
        window.recognition.abort();
    } catch (e) {}
}

// ================= SET MIC MODE =================
function setMicState(mode) {
    console.log("🎛️ MicMode:", mode);

    safeStopRecognition();
    stopWakeWord();

    if (mode === "OFF") return;

    if (mode === "STT") {
        setTimeout(() => {
            safeStartRecognition();
        }, 200);
    }

    if (mode === "WAKE") {
        if (!wakeWordRecognition) setupWakeWord();

        setTimeout(() => {
            try {
                wakeWordRecognition.start();
            } catch (e) {}
        }, 300);
    }
}

function toggleListening() {
    manualMicOverride = true;
    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) {
        safeStopRecognition();
    } else {
        safeStartRecognition();
    }
}

function stopListening() { 
    window.isListening = false;

    // 🔥 ปลด override ด้วย
    manualMicOverride = false;

    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');

    if (micBtn) micBtn.classList.remove('recording'); 
    if (statusText) statusText.innerText = (window.currentLang === 'th') 
        ? "แตะไมค์เพื่อเริ่มพูด" 
        : "Tap mic to speak";
}

// --- 🚩 ฟังก์ชันควบคุม Splash Screen (ปรับปรุงให้สมูท) ---
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

                const homeMsg = (window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                displayResponse(homeMsg);

                renderFAQButtons(); 
                initCamera();       
                console.log("🏠 [System] Home screen ready.");
            }, 800);
        }
    }, 500);
}

// --- 🚩 ฟังก์ชันกลางสำหรับจัดการสิทธิ์และการเล่นเสียง ---
function forceStopAllMic() {
    isWakeWordActive = false;
    
    // 1. ✅ ปลดสถานะการฟังทันที เพื่อให้ UI (ปุ่มไมค์) อัปเดตสถานะได้ไว
    if (typeof isListening !== 'undefined') window.isListening = false; 

    // 2. ✅ เคลียร์ Timer ทั้งหมดที่อาจจะกำลังนับถอยหลังสั่งส่งข้อความ หรือสั่งเปิดไมค์ซ้ำ
    if (window.micTimer) clearTimeout(window.micTimer);
    if (window.sttTimeout) clearTimeout(window.sttTimeout);

    // 3. ✅ หยุดการทำงานของไมค์ (ใช้ abort เพื่อตัดการทำงานทันที ไม่ต้องรอประมวลผลคำสุดท้าย)
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) {}
    }
    if (window.recognition) {
        try { window.recognition.abort(); } catch(e) {}
    }

    // 4. 🔥 ปรับ Logic การล็อกให้ยืดหยุ่น
    if (manualMicOverride) {
        // ถ้าคนกดเอง ต้องปลดล็อกทุกกรณี
        micHardLock = false;
    } else if (window.isBusy) {
        // ถ้า AI กำลังพูด/คิด (System Control) ให้ล็อกกันไมค์แทรก
        micHardLock = true;
    } else {
        // กรณีอื่นๆ (เช่น กลับหน้า Home) ให้ปลดล็อกเสมอ
        micHardLock = false;
    }

    console.log(`🛑 [System] Mic Released | HardLock: ${micHardLock} | Busy: ${window.isBusy}`);
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

// --- 1. ระบบจัดการสถานะ & Wake Word Setup ---
function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = true;
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
        }

        if (text.includes("น้องนำทาง")) {
            console.log("🎯 WAKE WORD DETECTED");

            safeStopRecognition();

            setTimeout(() => {
                setMicState("STT");
            }, 500);
        }
    };

    wakeWordRecognition.onend = () => {
    if (!isWakeWordActive) return;

    setTimeout(() => {
        try {
            wakeWordRecognition.start();
        } catch (e) {}
    }, 1000);
};

    // ✅ ต้องอยู่ใน function
    wakeWordRecognition.onerror = (event) => {
        console.warn("🎤 [WakeWord] Error:", event.error);
    };
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;

    // 🔥 ถ้าผู้ใช้กดไมค์ → ห้ามแทรก
    if (manualMicOverride) return;

    if (!window.allowWakeWord || isAtHome || isListeningNow || window.isMuted || window.isBusy) {
        isWakeWordActive = false;
        return;
    }

    try { 
        forceStopAllMic();

        setTimeout(() => {
            micHardLock = false;
            isWakeWordActive = true; 
            wakeWordRecognition.start(); 
            console.log("🎤 [System] WakeWord Stand-by...");
        }, 200);

    } catch (e) {}
}

function stopWakeWord() {
    isWakeWordActive = false; 
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch (e) {}
    }
}

function initSpeechRecognition() {
    if (window.recognition) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error("❌ Browser ไม่รองรับ SpeechRecognition");
        return;
    }

    window.recognition = new SpeechRecognition();
    window.recognition.lang = 'th-TH';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;

    window.recognition.onstart = () => {
        window.isListening = true;
        console.log("🎤 Mic START");
    };

    window.recognition.onend = () => {
        window.isListening = false;
        console.log("🛑 Mic END");
    };

    window.recognition.onerror = (e) => {
        console.warn("Mic Error:", e.error);
        window.isListening = false;
    };

    window.recognition.onresult = (e) => {
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            text += e.results[i][0].transcript;
        }
        console.log("🎯 RESULT:", text);
    };
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

// --- 🚩 3. ระบบคัดกรองใบขับขี่ (คงเดิม) ---
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

// --- 🚩 4. ระบบประมวลผลคำตอบ (คงเดิม) ---

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

// --- 🚩 5. ระบบเสียง (แก้ไขการหน่วงเวลาเพื่อความเสถียร) ---
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
            // เพิ่ม Delay เป็น 2 วินาทีเพื่อให้ Browser และ Hardware เสียงเงียบสนิทจริงๆ ก่อนเปิดไมค์
            setTimeout(() => {
                if (window.isBusy) return;

                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else {
                    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
                    if (!isListeningNow && typeof toggleListening === "function" && !manualMicOverride) {
                        console.log("🎤 [System] เปิดปุ่มไมค์รอคำถาม...");
                        setMicState("STT"); 

                        if (window.sttTimeout) clearTimeout(window.sttTimeout);
                        window.sttTimeout = setTimeout(() => {
                            const stillListening = typeof isListening !== 'undefined' ? isListening : false;
                            if (stillListening && !window.isBusy && !manualMicOverride) {
                                console.log("⏰ 5s Timeout: กลับไปโหมดดักฟังชื่อ");
                                setMicState("WAKE");
                            }
                        }, 6000); 
                    }
                }
            }, 2000); 
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
    if (progBar) progBar.style.width = '30%'; 
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            if (progBar) progBar.style.width = '100%';
            completeLoading(); 
        }
    } catch (e) { 
        console.error("Database Retry...");
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
