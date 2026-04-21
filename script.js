/**
 * 🚀 สมองกลน้องนำทาง - THE ULTIMATE MASTER HYBRID
 * รวมระบบ: Splash Screen + Advanced License Logic + Print + Audio Link + Deep Mic Sync
 * อัปเดตล่าสุด: 21 เมษายน 2026
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
const IDLE_TIME_LIMIT = 5000; 
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
        updateLottie('talking');
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
    console.log("🛑 [System] All Microphones Stopped.");
}

function stopAllSpeech() { 
    window.speechSynthesis.cancel(); 
    const audios = document.querySelectorAll('audio');
    audios.forEach(a => { a.pause(); a.currentTime = 0; });
    window.isSpeaking = false;
    updateLottie('idle'); 
}

// --- 🔊 3. ระบบเสียง & เล่นไฟล์เสียง (Speech & Audio Link) ---

function speak(text, callback = null) {
    if (!text || window.isMuted) { releaseSystemLock(); return; }
    forceStopAllMic(); stopAllSpeech();
    window.isBusy = true; window.isSpeaking = true;
    
    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'th-TH';
    msg.onstart = () => updateLottie('talking');
    msg.onend = () => { 
        window.isSpeaking = false;
        if (callback) callback();
        else setTimeout(releaseSystemLock, 1500); 
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
        setTimeout(() => { if (callback) callback(); else releaseSystemLock(); }, 1500);
    };
    audio.onerror = () => releaseSystemLock();
    audio.play().catch(e => releaseSystemLock());
}

// --- 🔍 4. ระบบประมวลผลคำตอบ & คัดกรองใบขับขี่ (Advanced License) ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); stopAllSpeech();
    isAtHome = false; window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();

    // ✅ ขั้นตอนคัดกรองใบขับขี่ (Advanced Step-by-Step)
    if ((query.includes("ใบขับขี่") || query.includes("ต่อ")) && 
        !query.includes("ชั่วคราว") && !query.includes("5 ปี") && !query.includes("2 ปี")) {
        
        const askMsg = "ใบขับขี่ของท่านเป็นแบบชั่วคราว (2 ปี) หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg); 
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", action: () => startLicenseExpiryCheck("แบบชั่วคราว (2 ปี)") },
            { th: "แบบ 5 ปี", action: () => startLicenseExpiryCheck("แบบ 5 ปี") }
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
                    if (query.includes("2 ปี") && key.includes("2 ปี")) score += 0.4;
                    if (query.includes("5 ปี") && key.includes("5 ปี")) score += 0.4;

                    if (score > bestMatch.score) {
                        bestMatch = { answer: item[1], score: score, audio: item[3], checklist: item[4] };
                    }
                }
            });
        }

        if (bestMatch.score >= 0.5) { 
            displayResponse(bestMatch.answer); 
            if (bestMatch.checklist) renderChecklist(bestMatch.checklist); 
            if (bestMatch.audio) playAudioLink(bestMatch.audio);
            else speak(bestMatch.answer);
        } else { 
            const noDataMsg = "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาลองสอบถามใหม่อีกครั้ง";
            displayResponse(noDataMsg); speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { releaseSystemLock(); }
}

function startLicenseExpiryCheck(type) {
    const msg = `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?`;
    displayResponse(msg);
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", action: () => generateLicenseResult(type, 'normal') },
        { th: "⚠️ หมดอายุเกิน 1 ปี (ไม่เกิน 3 ปี)", action: () => generateLicenseResult(type, 'over1') },
        { th: "❌ หมดอายุเกิน 3 ปี", action: () => generateLicenseResult(type, 'over3') }
    ]);
    speak(msg, () => { window.isBusy = false; });
}

function generateLicenseResult(type, expiry) {
    const isTemp = type.includes("ชั่วคราว") || type.includes("2 ปี");
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = "";

    if (isTemp) {
        if (expiry === 'normal') note = "ไม่ต้องอบรม ต่อได้ทันที";
        else if (expiry === 'over1') note = "อบรมสำนักงาน 5 ชม. และสอบข้อเขียนใหม่";
        else if (expiry === 'over3') note = "อบรมสำนักงาน 5 ชม. สอบข้อเขียนและสอบขับรถใหม่";
    } else {
        if (expiry === 'normal') { docs.push("ผลอบรมออนไลน์ (e-Learning)"); note = "อบรมออนไลน์ 1 ชม. และต่อได้ทันที"; }
        else if (expiry === 'over1') { docs.push("ผลอบรมออนไลน์ (e-Learning)"); note = "อบรมออนไลน์ 2 ชม. และสอบข้อเขียนใหม่"; }
        else if (expiry === 'over3') { note = "ต้องอบรมที่ขนส่ง 5 ชม. + สอบข้อเขียน + สอบขับรถ"; }
    }
    
    renderChecklist(docs.join('\n'), `ใบขับขี่ ${type}`, note);
    speak("น้องเตรียมรายการเอกสารให้แล้วครับ กรุณาติ๊กตรวจสอบให้ครบเพื่อพิมพ์ใบนำทาง");
}

// --- 📋 5. ระบบ Checklist & Printing ---

function renderChecklist(checklistText, title = "สิ่งที่ต้องเตรียมมา", subNote = "") {
    const container = document.getElementById('faq-container');
    if (!container) return;
    
    const items = checklistText.split('\n').filter(t => t.trim() !== "");
    let checklistHtml = items.map((item, i) => `
        <div class="check-item" style="margin: 12px 0; display: flex; align-items: center;">
            <input type="checkbox" id="chk-${i}" class="doc-checkbox" style="width: 25px; height: 25px; margin-right: 12px;">
            <label for="chk-${i}" style="font-size: 1.2rem;">${item}</label>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="checklist-card" style="background:#fff; padding:20px; border-radius:15px; border:2px solid #2d5a27; margin-bottom:15px; text-align:left;">
            <strong style="color:#2d5a27; font-size:1.3rem;">📋 ${title}</strong>
            ${subNote ? `<div style="color:#1a73e8; margin:5px 0; font-weight:bold;">💡 ${subNote}</div>` : ''}
            <hr>
            <div style="margin: 15px 0;">${checklistHtml}</div>
            <button id="btnPrint" class="print-btn" style="width:100%; padding:15px; background:#2d5a27; color:#fff; border-radius:10px; border:none; display:none; font-weight:bold; font-size:1.1rem;">
                🖨️ พิมพ์ใบนำทาง
            </button>
        </div>
    `;

    const checkboxes = container.querySelectorAll('.doc-checkbox');
    const btnPrint = container.querySelector('#btnPrint');
    checkboxes.forEach(chk => {
        chk.addEventListener('change', () => {
            const allChecked = Array.from(checkboxes).every(c => c.checked);
            btnPrint.style.display = allChecked ? 'block' : 'none';
        });
    });

    btnPrint.onclick = () => {
        window.print();
        speak("กำลังพิมพ์เอกสารให้ครับ กรุณารอสักครู่");
    };
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return;
    container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.innerText = opt.th;
        btn.style = "border: 2px solid #2d5a27; background: #e8f5e9; font-weight: bold; padding: 12px; margin: 5px; border-radius: 10px; cursor: pointer;";
        btn.onclick = () => { stopAllSpeech(); opt.action(); };
        container.appendChild(btn);
    });
}

// --- (ส่วนที่เหลือ: Splash, Camera, WakeWord คงเดิมเพื่อความเสถียร) ---

async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    if (progBar) progBar.style.width = '30%';
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json && json.database) { 
            window.localDatabase = json.database; 
            completeLoading(); 
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    const progBar = document.getElementById('splash-progress-bar');
    if (progBar) progBar.style.width = '100%';
    setTimeout(() => {
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                resetToHome();
                initCamera();       
            }, 800);
        }
    }, 500);
}

function resetToHome() {
    if (window.isBusy || window.isSpeaking) return;
    stopAllSpeech(); forceStopAllMic(); 
    isAtHome = true; window.allowWakeWord = false; 
    releaseSystemLock();
    displayResponse("กดปุ่มไมค์เพื่อเริ่มพูด");
    renderFAQButtons(); 
}

async function detectPerson() {
    if (typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = predictions.find(f => f.detection.score > 0.55 && f.detection.box.width > 90);
        if (face) {
            if (personInFrameTime === null) personInFrameTime = now;
            window.detectedGender = face.gender; lastSeenTime = now; 
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) greetUser(); 
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
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
    const now = new Date();
    const gender = window.detectedGender || 'male';
    let timeGreet = now.getHours() < 12 ? "สวัสดีตอนเช้าครับ" : now.getHours() < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ";
    let pType = (gender === 'male') ? "คุณผู้ชาย" : "คุณผู้หญิง";
    let finalGreet = `${timeGreet} ${pType} มีอะไรให้น้องนำทางช่วยไหมครับ?`;
    displayResponse(finalGreet);
    speak(finalGreet, () => { 
        window.isBusy = false; window.allowWakeWord = true; setTimeout(startWakeWord, 500);
    });
}

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; wakeWordRecognition.interimResults = true; wakeWordRecognition.lang = 'th-TH';
    wakeWordRecognition.onresult = (event) => {
        if (!window.allowWakeWord || window.isBusy || window.isSpeaking || window.isListening || manualMicOverride) return;
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) transcript += event.results[i][0].transcript;
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            forceStopAllMic(); manualMicOverride = true; window.isBusy = true;
            const msg = "ครับผม มีอะไรให้ช่วยไหมครับ?";
            displayResponse(msg); speak(msg, () => setTimeout(toggleListening, 300));
        }
    };
    wakeWordRecognition.onend = () => {
        if (window.allowWakeWord && !window.isBusy && !window.isSpeaking && !window.isListening && !manualMicOverride) {
            setTimeout(() => { try { wakeWordRecognition.start(); } catch(e) {} }, 1000);
        }
    };
}

function startWakeWord() { if (!window.allowWakeWord || isAtHome || window.isListening || window.isBusy || manualMicOverride) return; try { wakeWordRecognition.start(); } catch (e) {} }

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    window.recognition = new SpeechRecognition();
    window.recognition.lang = 'th-TH'; window.recognition.continuous = false;
    window.recognition.onstart = () => { window.isListening = true; updateMicVisuals('listening'); };
    window.recognition.onresult = (e) => {
        let transcript = e.results[0][0].transcript;
        if (transcript.trim() !== "") { getResponse(transcript); }
    };
    window.recognition.onend = () => { window.isListening = false; updateMicVisuals('idle'); };
}

function toggleListening() { stopAllSpeech(); forceStopAllMic(); window.isBusy = false; manualMicOverride = true; if (!window.recognition) initSpeechRecognition(); setTimeout(() => { try { window.recognition.start(); } catch (e) {} }, 200); }

function calculateSimilarity(s1, s2) { let longer = s1.length < s2.length ? s2 : s1; let shorter = s1.length < s2.length ? s1 : s2; if (longer.length === 0) return 1.0; return (longer.length - editDistance(longer, shorter)) / longer.length; }
function editDistance(s1, s2) { let costs = []; for (let i = 0; i <= s1.length; i++) { let lastValue = i; for (let j = 0; j <= s2.length; j++) { if (i === 0) costs[j] = j; else if (j > 0) { let newVal = costs[j - 1]; if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1; costs[j - 1] = lastValue; lastValue = newVal; } } if (i > 0) costs[s2.length] = lastValue; } return costs[s2.length]; }
function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }
function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); }
function updateLottie(state) { const player = document.getElementById('lottie-canvas'); if (!player) return; const assets = { 'idle': 'https://lottie.host/568e8594-a319-4491-bf10-a0f5c012fc76/6S3urqybG5.json', 'thinking': 'https://lottie.host/e742c203-f211-4521-a5aa-96cd5248d4b8/CKCd2cqmGj.json', 'talking': 'https://lottie.host/79a24a65-7d74-4ff7-8ac5-bb3eeaa49073/4BES9eWBuE.json' }; player.load(assets[state]); }
function displayResponse(text) { const el = document.getElementById('response-text'); if (el) el.innerHTML = text.replace(/\n/g, '<br>'); }
function renderFAQButtons() { const container = document.getElementById('faq-container'); if (!container || !window.localDatabase) return; container.innerHTML = ""; window.localDatabase["FAQ"].slice(1).forEach((row) => { const qText = row[0]; if (qText) { const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText; btn.onclick = () => { stopAllSpeech(); getResponse(qText); }; container.appendChild(btn); } }); }
async function loadFaceModels() { const MODEL_URL = 'https://taiyang12300.github.io/model/'; try { await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL); await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL); setupWakeWord(); requestAnimationFrame(detectPerson); } catch (err) {} }
async function initCamera() { try { video = document.getElementById('video'); const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; } } catch (err) {} }
async function logQuestionToSheet(userQuery) { if (!userQuery || !GAS_URL) return; try { await fetch(`${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`, { mode: 'no-cors' }); } catch (e) {} }

document.addEventListener('DOMContentLoaded', initDatabase);
document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);
