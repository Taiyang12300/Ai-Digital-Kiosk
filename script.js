/**
 * 🚀 สมองกลน้องนำทาง - THE ULTIMATE MASTER HYBRID (FINALISED)
 * รวมระบบ: Splash Screen + Advanced License Logic + Print + Audio Link + Deep Mic Sync
 * แก้ไข: ฟังก์ชันที่เรียกชื่อผิด และการจัดการ Mic Lock ให้เสถียร 100%
 */

// --- ⚙️ 1. Global States ---
window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false;          
window.isSpeaking = false;      
window.isListening = false;     
window.hasGreeted = false;      
window.allowWakeWord = false; 
let isAtHome = true; 
let manualMicOverride = false;  

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
const IDLE_TIME_LIMIT = 10000; // ปรับเป็น 10 วินาทีเพื่อให้คนมีเวลาอ่านใบนำทาง
let video; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

let wakeWordRecognition;

// --- 🛡️ 2. ระบบควบคุมศูนย์กลาง (SSOT & Mic Sync) ---

function releaseSystemLock() {
    window.isBusy = false;
    window.isSpeaking = false;
    manualMicOverride = false; 
    updateMicVisuals('idle');
    // เปิด Wake Word เฉพาะตอนไม่ได้อยู่หน้าโฮม และไม่อยู่ในสถานะยุ่ง
    if (window.allowWakeWord && !isAtHome) {
        setTimeout(startWakeWord, 800);
    }
}

function updateMicVisuals(state) {
    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');
    if (!micBtn || !statusText) return;
    if (state === 'listening') {
        micBtn.classList.add('recording');
        statusText.innerText = "กำลังฟัง...";
    } else {
        micBtn.classList.remove('recording');
        statusText.innerText = "แตะไมค์เพื่อเริ่มพูด";
    }
}

function forceStopAllMic() {
    window.isListening = false;
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    updateMicVisuals('idle');
}

function stopAllSpeech() { 
    window.speechSynthesis.cancel(); 
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => { if(!a.id.includes('queueSound')){ a.pause(); a.currentTime = 0; } });
    window.isSpeaking = false;
    updateLottie('idle'); 
}

// --- 🔊 3. ระบบเสียง & เล่นไฟล์เสียง (Speech & Audio Link) ---

function speak(text, callback = null) {
    if (!text || window.isMuted) { releaseSystemLock(); return; }
    forceStopAllMic(); stopAllSpeech();
    window.isBusy = true; window.isSpeaking = true;
    
    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    msg.onstart = () => updateLottie('talking');
    msg.onend = () => { 
        window.isSpeaking = false;
        if (callback) callback();
        else releaseSystemLock(); 
    };
    window.speechSynthesis.speak(msg);
}

function playAudioLink(url, callback = null) {
    if (!url) { releaseSystemLock(); return; }
    stopAllSpeech(); forceStopAllMic();
    window.isBusy = true; window.isSpeaking = true;
    updateLottie('talking');
    const audio = new Audio(url);
    audio.onended = () => {
        window.isSpeaking = false;
        if (callback) callback(); else releaseSystemLock();
    };
    audio.onerror = () => releaseSystemLock();
    audio.play().catch(e => releaseSystemLock());
}

// --- 🔍 4. ระบบประมวลผลคำตอบ & คัดกรองใบขับขี่ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    stopAllSpeech();
    isAtHome = false; 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();

    // ✅ ตรวจสอบคีย์เวิร์ดใบขับขี่ (Advanced Step-by-Step)
    if ((query.includes("ใบขับขี่") || query.includes("ต่อ")) && 
        !query.includes("ชั่วคราว") && !query.includes("5 ปี") && !query.includes("2 ปี")) {
        
        const askMsg = "ใบขับขี่ของท่านเป็นแบบชั่วคราว (2 ปี) หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg); 
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
            { th: "แบบ 5 ปี", action: () => startLicenseCheck("แบบ 5 ปี") }
        ]);
        speak(askMsg, () => { window.isBusy = false; });
        return;
    }

    // 🔍 ระบบค้นหาปกติพร้อม Bonus Scoring
    try {
        let bestMatch = { answer: "", score: 0, audio: "", checklist: "" };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) return;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                for (const key of keyList) {
                    let score = calculateSimilarity(query, key);
                    if ((query.includes("2 ปี") || query.includes("ชั่วคราว")) && (key.includes("2 ปี") || key.includes("ชั่วคราว"))) score += 0.4;
                    if (query.includes("5 ปี") && key.includes("5 ปี")) score += 0.4;

                    if (score > bestMatch.score) {
                        bestMatch = { answer: item[1], score: score, audio: item[3], checklist: item[4] };
                    }
                }
            });
        }

        if (bestMatch.score >= 0.5) { 
            displayResponse(bestMatch.answer); 
            if (bestMatch.checklist) {
                // ถ้ามีฟิลด์ Checklist ในชีต ให้เรียกแสดง
                showLicenseChecklist(userQuery, 'normal'); 
            } else if (bestMatch.audio) {
                playAudioLink(bestMatch.audio);
            } else {
                speak(bestMatch.answer);
            }
        } else { 
            const noDataMsg = "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่ หรือลองเลือกคำถามที่พบบ่อยนะครับ";
            displayResponse(noDataMsg); speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { releaseSystemLock(); }
}

function startLicenseCheck(type) {
    forceStopAllMic(); 
    isAtHome = false;
    window.isBusy = true;
    const msg = `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?`;
    displayResponse(msg);
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", action: () => showLicenseChecklist(type, 'normal') },
        { th: "⚠️ หมดอายุเกิน 1 ปี (แต่ไม่เกิน 3 ปี)", action: () => showLicenseChecklist(type, 'over1') },
        { th: "❌ หมดอายุเกิน 3 ปี", action: () => showLicenseChecklist(type, 'over3') }
    ]);
    speak(msg, () => { window.isBusy = false; });
}

function showLicenseChecklist(type, expiry) {
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
        checklistHTML += `<div class="check-item" onclick="const c=document.getElementById('chk-${idx}'); c.checked=!c.checked; checkChecklist();">
            <input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" onclick="event.stopPropagation()">
            <label>${d}</label>
        </div>`;
    });

    const resultHTML = `
        <div class="checklist-card">
            <strong style="font-size:22px;">📄 ใบนำทาง: ${type}</strong><br>
            <div style="background:#e8f0fe; color:#1a73e8; padding:8px; border-radius:5px; margin-top:5px; font-weight:bold;">💡 ${note}</div>
            <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
            ${checklistHTML}
            <button id="btnPrintGuide" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}'); setTimeout(() => { resetToHome(); }, 2000);">🖨️ ปริ้นใบนำทาง</button>
        </div>`;
    
    displayResponse(resultHTML);
    speak("กรุณาติ๊กตรวจสอบเอกสารให้ครบ เพื่อปริ้นใบนำทางครับ");
}

function checkChecklist() {
    updateInteractionTime(); 
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    if (allChecked) { 
        printBtn.classList.add('show-btn');
        printBtn.style.setProperty('display', 'block', 'important'); 
    } else { 
        printBtn.classList.remove('show-btn');
        printBtn.style.setProperty('display', 'none', 'important'); 
    }
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return;
    container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.innerText = opt.th;
        btn.style.border = "2px solid #6c5ce7";
        btn.onclick = () => { stopAllSpeech(); opt.action(); };
        container.appendChild(btn);
    });
}

// --- 5. ระบบโครงสร้างพื้นฐาน (Camera, Database, WakeWord) ---

async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    if (progBar) progBar.style.width = '40%';
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json && json.database) { 
            window.localDatabase = json.database; 
            if (progBar) progBar.style.width = '100%';
            setTimeout(completeLoading, 500);
        }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            resetToHome();
            initCamera();       
        }, 800);
    }
}

function resetToHome() {
    stopAllSpeech(); forceStopAllMic(); 
    isAtHome = true; 
    window.hasGreeted = false;
    window.allowWakeWord = false; 
    releaseSystemLock();
    displayResponse("กดปุ่มไมค์เพื่อเริ่มพูด หรือเรียก 'น้องนำทาง'");
    renderFAQButtons(); 
}

async function detectPerson() {
    if (typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
        if (predictions.length > 0) {
            if (personInFrameTime === null) personInFrameTime = now;
            lastSeenTime = now; 
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) greetUser(); 
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 7000)) {
                personInFrameTime = null; window.hasGreeted = false; window.allowWakeWord = false;
                if (!isAtHome) resetToHome();
            }
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    isAtHome = false; window.hasGreeted = true; window.isBusy = true; 
    const finalGreet = "สวัสดีครับ มีอะไรให้น้องนำทางช่วยไหมครับ? สอบถามข้อมูลใบขับขี่ได้เลยนะครับ";
    displayResponse(finalGreet);
    speak(finalGreet, () => { 
        window.isBusy = false; window.allowWakeWord = true; setTimeout(startWakeWord, 500);
    });
}

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';
    wakeWordRecognition.onresult = (event) => {
        if (!window.allowWakeWord || window.isBusy || window.isSpeaking || window.isListening || manualMicOverride) return;
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) transcript += event.results[i][0].transcript;
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            forceStopAllMic(); manualMicOverride = true; 
            const msg = "ครับผม มีอะไรให้ช่วยไหมครับ?";
            displayResponse(msg); speak(msg, () => setTimeout(toggleListening, 300));
        }
    };
    wakeWordRecognition.onend = () => {
        if (window.allowWakeWord && !window.isBusy && !window.isSpeaking && !window.isListening) {
            setTimeout(() => { try { wakeWordRecognition.start(); } catch(e) {} }, 1000);
        }
    };
}

function startWakeWord() { 
    if (!window.allowWakeWord || isAtHome || window.isListening || window.isBusy) return; 
    try { wakeWordRecognition.start(); } catch (e) {} 
}

function toggleListening() { 
    stopAllSpeech(); forceStopAllMic(); 
    window.isBusy = false; 
    manualMicOverride = true; 
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.recognition) {
        window.recognition = new SpeechRecognition();
        window.recognition.lang = 'th-TH';
        window.recognition.onstart = () => { window.isListening = true; updateMicVisuals('listening'); };
        window.recognition.onresult = (e) => { getResponse(e.results[0][0].transcript); };
        window.recognition.onend = () => { 
            window.isListening = false; updateMicVisuals('idle'); 
            if(!isAtHome) setTimeout(startWakeWord, 2000);
        };
    }
    try { window.recognition.start(); } catch (e) {} 
}

// --- Helpers ---
function calculateSimilarity(s1, s2) { let longer = s1.length < s2.length ? s2 : s1; let shorter = s1.length < s2.length ? s1 : s2; if (longer.length === 0) return 1.0; return (longer.length - editDistance(longer, shorter)) / longer.length; }
function editDistance(s1, s2) { let costs = []; for (let i = 0; i <= s1.length; i++) { let lastValue = i; for (let j = 0; j <= s2.length; j++) { if (i === 0) costs[j] = j; else if (j > 0) { let newVal = costs[j - 1]; if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1; costs[j - 1] = lastValue; lastValue = newVal; } } if (i > 0) costs[s2.length] = lastValue; } return costs[s2.length]; }
function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }
function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); }
function updateLottie(state) { const player = document.getElementById('lottie-canvas'); if (!player) return; const assets = { 'idle': 'https://lottie.host/568e8594-a319-4491-bf10-a0f5c012fc76/6S3urqybG5.json', 'thinking': 'https://lottie.host/e742c203-f211-4521-a5aa-96cd5248d4b8/CKCd2cqmGj.json', 'talking': 'https://lottie.host/79a24a65-7d74-4ff7-8ac5-bb3eeaa49073/4BES9eWBuE.json' }; player.load(assets[state]); }
function displayResponse(text) { const el = document.getElementById('response-text'); if (el) el.innerHTML = text.replace(/\n/g, '<br>'); }
function renderFAQButtons() { const container = document.getElementById('faq-container'); if (!container || !window.localDatabase) return; container.innerHTML = ""; window.localDatabase["FAQ"].slice(1).forEach((row) => { const qText = row[0]; if (qText) { const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText; btn.onclick = () => { stopAllSpeech(); getResponse(qText); }; container.appendChild(btn); } }); }
async function loadFaceModels() { const MODEL_URL = 'https://taiyang12300.github.io/model/'; try { await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL); setupWakeWord(); requestAnimationFrame(detectPerson); } catch (err) {} }
async function initCamera() { try { video = document.getElementById('video'); const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; } } catch (err) {} }
async function logQuestionToSheet(userQuery) { if (!userQuery || !GAS_URL) return; try { await fetch(`${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`, { mode: 'no-cors' }); } catch (e) {} }

document.addEventListener('DOMContentLoaded', initDatabase);
document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);
