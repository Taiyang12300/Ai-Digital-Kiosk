/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Legacy Search Logic & Deep Mic Reset)
 * แก้ไข: การเปิด-ปิดไมค์ให้สัมพันธ์กับสถานะการพูด (Speak = Stop / End = Start)
 * ปรับปรุง: เสถียรภาพการสลับโหมดไมค์ และระบบ Loading Screen
 * เพิ่มเติม: ระบบล้างกล่องข้อความอัตโนมัติเมื่อส่งข้อมูล
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
let micHardLock = false; 
let manualMicOverride = false; 
let isWakeWordActive = false;
let lastFinalTranscript = ""; // เพิ่มตัวแปรสะสมข้อความเพื่อความแม่นยำในการล้างค่า

function toggleListening() { 
    manualMicOverride = true;
    micHardLock = false; 

    window.speechSynthesis.cancel(); 
    if (window.micTimer) clearTimeout(window.micTimer);
    
    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) { 
        try { window.recognition.stop(); } catch (e) {}
        window.isListening = false;
        manualMicOverride = false; 
        return; 
    } 

    forceStopAllMic(); 
    
    setTimeout(() => {
        try {
            micHardLock = false;
            window.recognition.start(); 
        } catch (e) { 
            window.isListening = false;
        }
    }, 200); 
}

function stopListening() { 
    window.isListening = false;
    manualMicOverride = false;
    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');
    if (micBtn) micBtn.classList.remove('recording'); 
    if (statusText) statusText.innerText = (window.currentLang === 'th') ? "แตะไมค์เพื่อเริ่มพูด" : "Tap mic to speak";
}

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
            }, 800);
        }
    }, 500);
}

function forceStopAllMic() {
    isWakeWordActive = false;
    if (typeof isListening !== 'undefined') isListening = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    if (manualMicOverride) { micHardLock = false; } else if (window.isBusy) { micHardLock = true; }
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
        if (!window.allowWakeWord || window.isBusy || isListeningNow) return;
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) { transcript += event.results[i][0].transcript; }
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            isWakeWordActive = false; 
            forceStopAllMic();        
            window.isBusy = true;     
            let msg = "";
            if (window.currentLang === 'th') {
                const affirmations = ["ครับผม", "สวัสดีครับ", "น้องนำทางมาแล้วครับ"];
                const questions = ["มีอะไรให้ช่วยไหมครับ?", "สอบถามข้อมูลได้เลยนะครับ"];
                msg = `${affirmations[Math.floor(Math.random() * affirmations.length)]} ${questions[Math.floor(Math.random() * questions.length)]}`;
            } else { msg = "Yes! How can I help you?"; }
            displayResponse(msg);
            setTimeout(() => { speak(msg); }, 300); 
        }
    };
    wakeWordRecognition.onend = () => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (manualMicOverride) return;
        if (micHardLock) return;
        if (!isAtHome && personInFrameTime !== null && !window.isBusy && !isListeningNow && isWakeWordActive) {
            setTimeout(() => { try { if (!micHardLock && !window.isBusy && !isListeningNow && !isAtHome && isWakeWordActive) { wakeWordRecognition.start(); } } catch(e) {} }, 1500); 
        } else { isWakeWordActive = false; }
    };
    wakeWordRecognition.onerror = (event) => { if (event.error === 'not-allowed') { window.allowWakeWord = false; isWakeWordActive = false; } };
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
    if (manualMicOverride) return;
    if (!window.allowWakeWord || isAtHome || isListeningNow || window.isMuted || window.isBusy) { isWakeWordActive = false; return; }
    try { forceStopAllMic(); setTimeout(() => { micHardLock = false; isWakeWordActive = true; wakeWordRecognition.start(); }, 200); } catch (e) {}
}

function stopWakeWord() { isWakeWordActive = false; if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch (e) {} } }

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;

    // เพิ่มตัวล็อคสถานะการส่ง
    let isSubmitting = false;

    window.recognition.onstart = () => {
        window.isListening = true;
        isSubmitting = false; // รีเซ็ตสถานะส่ง
        lastFinalTranscript = ""; 
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse(window.currentLang === 'th' ? "กำลังฟัง... พูดได้เลยครับ" : "Listening...");
    };

    window.recognition.onresult = (e) => {
        // 🛑 ถ้ากำลังส่งข้อมูลอยู่ ให้หยุดประมวลผลทันที (กันข้อความเบิ้ลตอนไมค์ปิด)
        if (isSubmitting) return;

        if (window.micTimer) clearTimeout(window.micTimer);
        
        let interimTranscript = "";
        let newFinalText = "";

        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) {
                newFinalText += e.results[i][0].transcript;
            } else {
                interimTranscript += e.results[i][0].transcript;
            }
        }

        lastFinalTranscript += newFinalText;
        const inputField = document.getElementById('userInput');
        
        if (inputField) {
            // พิมพ์ลงช่องข้อความเฉพาะตอนที่กำลังพูด
            inputField.value = lastFinalTranscript + interimTranscript;

            // 🚀 ตั้งเวลาส่งอัตโนมัติ (ปรับเหลือ 2 วินาทีเพื่อให้ไวขึ้น)
            window.micTimer = setTimeout(() => {
                const finalQuery = inputField.value.trim();
                
                if (finalQuery !== "" && !isSubmitting) {
                    isSubmitting = true; // ล็อคทันทีกันส่งซ้ำ
                    
                    console.log("🚀 [Auto-Submit] Sending:", finalQuery);
                    
                    // 1. สั่งหยุดไมค์ทันที
                    try { window.recognition.stop(); } catch(err) {} 
                    
                    // 2. ✅ ล้างค่าทุกอย่างทันที "ก่อน" เรียก getResponse
                    // เพื่อให้ตอนไมค์ตัดจบ (onend) ไม่มีข้อความเหลือไปแปะซ้ำ
                    inputField.value = ""; 
                    lastFinalTranscript = ""; 

                    // 3. ส่งข้อมูล
                    getResponse(finalQuery); 
                }
            }, 2000); 
        }
    };

    window.recognition.onend = () => {
        window.isListening = false;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.remove('recording');
        // ปลดล็อคสถานะเมื่อไมค์จบการทำงานสมบูรณ์
        setTimeout(() => { isSubmitting = false; }, 500);
    };

    window.recognition.onerror = (e) => {
        console.error("Mic Error:", e.error);
        isSubmitting = false;
    };
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

function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); }

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
    } else { finalGreet = `Hello ${gender === 'male' ? 'Sir' : 'Madam'}, how can I help you?`; }
    displayResponse(finalGreet);
    speak(finalGreet, () => { window.isBusy = false; window.allowWakeWord = true; }, true); 
}

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
    docs.forEach((d, idx) => { checklistHTML += `<div class="check-item" onclick="document.getElementById('chk-${idx}').click()"><input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" onclick="event.stopPropagation()"><label>${d}</label></div>`; });
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

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    
    // ✅ ล้างค่าทุกครั้งก่อนเริ่มกระบวนการใหม่
    const inputField = document.getElementById('userInput');
    if (inputField) inputField.value = ""; 
    lastFinalTranscript = "";

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
                    else { let simScore = calculateSimilarity(query, key); score = simScore * 5; }
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                }
            });
        }
        if (bestMatch.score >= 0.45 && bestMatch.answer !== "") { displayResponse(bestMatch.answer); speak(bestMatch.answer); } 
        else { 
            const noDataMsg = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ" : "No info found.";
            displayResponse(noDataMsg); speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { window.isBusy = false; }
}

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
                if (window.isBusy) return;
                if (isGreeting) { window.allowWakeWord = true; startWakeWord(); } 
                else {
                    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
                    if (!isListeningNow && typeof toggleListening === "function" && !manualMicOverride) {
                        toggleListening(); 
                        if (window.sttTimeout) clearTimeout(window.sttTimeout);
                        window.sttTimeout = setTimeout(() => {
                            const stillListening = typeof isListening !== 'undefined' ? isListening : false;
                            if (stillListening && !window.isBusy && !manualMicOverride) { forceStopAllMic(); window.allowWakeWord = true; startWakeWord(); }
                        }, 6000); 
                    }
                }
            }, 2000); 
        }
    };
    msg.onerror = () => { window.isBusy = false; updateLottie('idle'); };
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
        btn.onclick = () => { stopAllSpeech(); window.isBusy = false; if (opt.action) opt.action(); else if (opt.s_th) getResponse(window.currentLang === 'th' ? opt.s_th : opt.s_en); };
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

function displayResponse(text) { const responseEl = document.getElementById('response-text'); if (responseEl) responseEl.innerHTML = text.replace(/\n/g, '<br>'); }

async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    if (progBar) progBar.style.width = '30%'; 
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { window.localDatabase = json.database; if (progBar) progBar.style.width = '100%'; completeLoading(); }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; }
    } catch (err) { console.error("❌ Camera Error"); }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAllSpeech(); forceStopAllMic(); } });
window.addEventListener('beforeunload', () => { stopAllSpeech(); forceStopAllMic(); });
document.addEventListener('DOMContentLoaded', initDatabase);
