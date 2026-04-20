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
            
            // หน่วงเวลา 1.8 วินาทีหลังจากหยุดพูด เพื่อประมวลผลคำตอบ
            window.micTimer = setTimeout(() => {
                processQuery(transcript);
                window.recognition.stop(); 
            }, 1800); 
        }
    };

    window.recognition.onend = () => { 
        stopListening(); 
        // เมื่อไมค์ STT จบ ให้กลับไปโหมด Wake Word (ถ้าไม่ได้ยุ่งอยู่และไม่อยู่หน้า Home)
        if (typeof startWakeWord === "function" && !window.isBusy && !isAtHome) {
            startWakeWord();
        }
    };

    window.recognition.onerror = (e) => {
        if (e.error === 'no-speech') return;
        console.error("Mic Error:", e.error);
        stopListening();
    };
}

function toggleListening() { 
    // 🚀 MASTER RESET: ขัดจังหวะทุกอย่างทันทีเมื่อกดปุ่ม
    
    // 1. หยุดเสียงอ่าน (TTS)
    window.speechSynthesis.cancel(); 
    
    // 2. หยุดไฟล์เสียงจาก Link (MP3) ที่กำลังเล่นอยู่
    if (window.currentAudioLink) {
        window.currentAudioLink.pause();
        window.currentAudioLink.currentTime = 0;
        console.log("🛑 [Audio] Link Interrupted by User");
    }

    // 3. หยุดไฟล์เสียงอื่นๆ ทั้งหมดในหน้าเว็บ
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => { a.pause(); a.currentTime = 0; });

    // 4. เคลียร์ Timer และหยุดไมค์ทุกตัว (Wake Word / STT เดิม)
    if (window.micTimer) clearTimeout(window.micTimer);
    forceStopAllMic(); 

    // 5. [FIX] ปลดล็อกสถานะทุกอย่างทันที
    window.isBusy = false; 
    window.isAudioPlaying = false; // 📌 สำคัญมาก: ต้องล้างค่านี้เพื่อให้ระบบ Auto-mic กลับมาทำงานได้ปกติ
    window.currentAudioLink = null; 

    // --- ส่วนของ Logic การจัดการสถานะไมค์ STT ---
    
    // ถ้ามีการฟังอยู่ ให้หยุด (Toggle Off)
    if (window.isListening || (window.recognition && window.recognition.state === 'running')) { 
        try {
            if (window.recognition) window.recognition.stop(); 
        } catch (e) { console.warn("Stop Error:", e); }
        window.isListening = false;
        console.log("🎤 [Mic] User toggled OFF");
        return; 
    } 

    // เริ่มการฟังใหม่ (Toggle On)
    try {
        if (window.recognition) {
            window.recognition.start(); 
            console.log("🎤 [Mic] User toggled ON / Started listening...");
        }
    } catch (e) { 
        console.error("Mic Start Error (Attempting recovery):", e);
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

                const homeMsg = (window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                displayResponse(homeMsg);

                renderFAQButtons(); 
                initCamera();       
                initSpeechRecognition(); // [NEW] เริ่มต้นระบบ STT
                console.log("🏠 [System] Home screen ready.");
            }, 800);
        }
    }, 500);
}

// --- 🚩 ฟังก์ชันกลางสำหรับจัดการสิทธิ์และการเล่นเสียง ---
function forceStopAllMic() {
    // 1. หยุดสถานะการทำงานหลัก
    isWakeWordActive = false;
    window.isListening = false; 

    // 2. [NEW] ล้าง Timer ทั้งหมดที่อาจสั่งเปิดไมค์อัตโนมัติ (ป้องกัน InvalidStateError)
    if (window.micTimer) {
        clearTimeout(window.micTimer);
        window.micTimer = null;
    }

    // 3. หยุดการรับสัญญาณจากไมค์ทุกตัวทันที
    if (wakeWordRecognition) {
        try { 
            wakeWordRecognition.abort(); // ใช้ abort เพื่อตัดการเชื่อมต่อทันที
        } catch(e) { console.warn("WakeWord abort error:", e); }
    }
    
    if (window.recognition) {
        try { 
            window.recognition.abort(); // เคลียร์สถานะเพื่อให้ Browser ปล่อยทรัพยากรไมค์
        } catch(e) { console.warn("Recognition abort error:", e); }
    }

    // 4. [NEW] รีเซ็ต UI ของปุ่มไมค์ (ถ้ามี)
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
        micBtn.classList.remove('recording'); // ลบ Class ที่ทำให้ปุ่มกระพริบหรือเปลี่ยนสี
    }

    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.innerText = (window.currentLang === 'th') ? "แตะไมค์เพื่อเริ่มพูด" : "Tap mic to speak";
    }

    console.log("🛑 [System] All Microphones Released & Timers Cleared.");
}

function playAudioLink(url, callback = null) {
    if (!url) return;

    stopAllSpeech(); 
    forceStopAllMic(); 
    
    window.isBusy = true;
    window.isAudioPlaying = true; // 🔒 ล็อคทันที
    updateLottie('talking');

    const audio = new Audio(url);
    window.currentAudioLink = audio; 

    audio.onplay = () => {
    window.isAudioPlaying = true;
    window.isBusy = true; // ล็อคระบบกันแทรก
    updateLottie('talking'); // ให้หุ่นขยับตอนเล่น MP3
    forceStopAllMic(); 
    console.log("🔊 [Audio Link] Playing... All Mics strictly locked.");
    };

    audio.onended = () => {
        window.isAudioPlaying = false; // 🔓 ปลดล็อคเมื่อจบไฟล์เท่านั้น
        
        setTimeout(() => {
            // เช็กสถานะอีกครั้งเผื่อมีการกดขัดจังหวะด้วยมือไปก่อนหน้า
            if (!window.isAudioPlaying) {
                window.isBusy = false;
                window.currentAudioLink = null;
                updateLottie('idle');
                
                if (callback) callback();
                else if (!isAtHome) {
                    window.allowWakeWord = true;
                    startWakeWord();
                }
            }
        }, 1200); 
    };

    audio.onerror = () => { 
        window.isBusy = false; 
        window.isAudioPlaying = false;
        window.currentAudioLink = null;
    };

    audio.play().catch(e => { 
        window.isBusy = false; 
        window.isAudioPlaying = false;
    });
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
    
    // ตรวจสอบว่าระบบยุ่งอยู่ หรือยังมีคนอยู่หน้าจอหรือไม่
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer(); 
        return;
    }
    
    if (isAtHome) return; 

    // --- 🛑 1. ล้างสถานะการทำงาน (Logic Reset) ---
    stopAllSpeech(); 
    forceStopAllMic(); 
    forceUnmute(); 
    
    window.hasGreeted = false;
    window.allowWakeWord = false; 
    window.isBusy = false; 
    window.isAudioPlaying = false; // [NEW] ล้างสถานะล็อคเสียง MP3
    window.currentAudioLink = null; 
    personInFrameTime = null;       
    isAtHome = true; 

    // --- 🧹 2. ล้างค่าหน้าจอและช่องพิมพ์ (UI Reset) ---
    
    // ล้างตัวหนังสือที่ค้างอยู่ในช่องกรอกคำถาม
    const inputField = document.getElementById('userInput');
    if (inputField) {
        inputField.value = ""; 
    }

    // รีเซ็ตข้อความตอบกลับบนหน้าจอให้เป็นค่าเริ่มต้น
    const homeMsg = (window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    displayResponse(homeMsg);

    // รีเซ็ตตัวการ์ตูน Lottie ให้กลับท่าปกติ
    if (typeof updateLottie === "function") {
        updateLottie('idle');
    }

    // แสดงปุ่มคำถามยอดฮิต (FAQ) ใหม่
    renderFAQButtons(); 

    // --- 🕒 3. ล้าง Timer ---
    if (idleTimer) { 
        clearTimeout(idleTimer); 
        idleTimer = null; 
    }

    console.log("🏠 [System] Home screen and UI have been fully reset.");
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
    
    // ล้างช่องพิมพ์ทันทีเมื่อเริ่มค้นหา
    const inputField = document.getElementById('userInput');
    if (inputField) inputField.value = ""; 

    const respBox = document.getElementById('response-text');
    if (respBox) respBox.innerText = (window.currentLang === 'th') ? "กำลังค้นหา..." : "Searching...";
    await getResponse(query);
}

// --- 🚩 5. ระบบเสียง (แก้ไขให้ขัดจังหวะได้และเชื่อมต่อ STT) ---
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
        setTimeout(() => {
            // 🛡️ เพิ่ม window.isAudioPlaying ในการเช็ก เพื่อกัน MP3 โดนตัด
            if (window.isBusy || window.isAudioPlaying) {
                console.log("⏳ [Prevent] Auto-Mic blocked: MP3 is still playing.");
                return;
            }

            if (isGreeting) {
                window.allowWakeWord = true;
                startWakeWord(); 
            } else {
                if (!window.isListening && typeof toggleListening === "function") {
                    console.log("🎤 [Auto] Safe to open mic...");
                    toggleListening();  

                        if (window.micTimer) clearTimeout(window.micTimer);
                        window.micTimer = setTimeout(() => {
                            if (window.isListening && !window.isBusy) {
                                forceStopAllMic(); 
                                window.allowWakeWord = true;
                                startWakeWord(); 
                            }
                        }, 6000); 
                    }
                }
            }, 1000); 
        }
    };

    msg.onerror = () => { window.isBusy = false; updateLottie('idle'); };
    window.speechSynthesis.speak(msg);
}

function stopAllSpeech() { 
    window.speechSynthesis.cancel(); 
    if (window.currentAudioLink) {
        window.currentAudioLink.pause();
        window.currentAudioLink.currentTime = 0;
    }
    window.isBusy = false; 
    window.isAudioPlaying = false; // ล้างค่าเสมอ
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
