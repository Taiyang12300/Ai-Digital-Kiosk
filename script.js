/**
 * 🚀 สมองกลน้องนำทาง - THE ULTIMATE MASTER HYBRID
 * รวมระบบ: Splash Screen + License Checklist + Print + Audio Link + Mic Sync
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
    if (window.allowWakeWord && !isAtHome) {
        setTimeout(startWakeWord, 500);
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
        else setTimeout(releaseSystemLock, 2000); 
    };
    window.speechSynthesis.speak(msg);
}

function playAudioLink(url, callback = null) {
    if (!url) return;
    stopAllSpeech(); forceStopAllMic();
    window.isBusy = true; window.isSpeaking = true;
    updateLottie('talking');
    const audio = new Audio(url);
    audio.onended = () => {
        window.isSpeaking = false;
        setTimeout(() => { if (callback) callback(); else releaseSystemLock(); }, 2000);
    };
    audio.onerror = () => releaseSystemLock();
    audio.play().catch(e => releaseSystemLock());
}

// --- 🔍 4. ระบบประมวลผลคำตอบ & คัดกรองใบขับขี่ (License System) ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); stopAllSpeech();
    isAtHome = false; window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
    
        // ✅ ระบบคัดกรองใบขับขี่
    if ((query.includes("ใบขับขี่") || query.includes("license")) && 
        (query.includes("ต่อ") || query.includes("renew")) && 
        !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        
        forceStopAllMic();
        const askMsg = "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg); 

        // ย้ายการสร้างปุ่มมาไว้ตรงนี้เลย ไม่ต้องรอพูดจบ เพื่อความไว
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
            { th: "แบบ 5 ปี", action: () => startLicenseCheck("แบบ 5 ปี") }
        ]);

        speak(askMsg, () => { 
            window.isBusy = false; 
        });
        return;
    }

    try {
        let bestMatch = { answer: "", score: 0, audio: "", checklist: "" };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) return;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                
                let ans = item[1] || "";
                let aud = item[3] || ""; // ลิงก์เสียง
                let chk = item[4] || ""; // Checklist
                
                for (const key of keyList) {
                    let score = (query === key) ? 10.0 : calculateSimilarity(query, key);
                    if (score > bestMatch.score) {
                        bestMatch = { answer: ans, score: score, audio: aud, checklist: chk };
                    }
                }
            });
        }

        if (bestMatch.score >= 0.45 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer); 
            if (bestMatch.checklist) renderChecklist(bestMatch.checklist); // แสดง Checklist + Print

            if (bestMatch.audio) playAudioLink(bestMatch.audio); // เล่นเสียงจากลิงก์
            else speak(bestMatch.answer); // พูดปกติ
        } else { 
            const noDataMsg = "ขออภัยครับ น้องหาข้อมูลไม่พบ";
            displayResponse(noDataMsg); speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { releaseSystemLock(); }
}

function startLicenseCheck(type) {
    let searchKey = (type === "แบบชั่วคราว (2 ปี)") ? "ต่อใบขับขี่ชั่วคราว" : "ต่อใบขับขี่ 5 ปี";
    getResponse(searchKey);
}

// --- 📋 5. ระบบ Checklist & Printing ---

function renderChecklist(checklistText) {
    const container = document.getElementById('faq-container');
    if (!container) return;
    
    const listHtml = checklistText.split('\n').map(item => `<li>✅ ${item}</li>`).join('');
    const checklistCard = document.createElement('div');
    checklistCard.className = 'checklist-card';
    checklistCard.innerHTML = `
        <div style="text-align:left; background:white; padding:15px; border-radius:10px; margin-bottom:10px; border:2px solid #ddd;">
            <strong style="color:#2d5a27;">📋 รายการที่ต้องเตรียม:</strong>
            <ul style="list-style:none; padding:0; margin:10px 0;">${listHtml}</ul>
            <button onclick="window.print()" class="print-btn" style="width:100%; padding:10px; background:#444; color:white; border:none; border-radius:5px; cursor:pointer;">
                🖨️ พิมพ์รายการเตรียมตัว
            </button>
        </div>
    `;
    container.prepend(checklistCard);
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) {
        console.error("❌ ไม่พบ faq-container ในหน้าเว็บ");
        return;
    }

    // ล้างปุ่ม FAQ เดิมออก
    container.innerHTML = "";

    options.forEach(opt => {
        const btn = document.createElement('button');
        
        // กำหนด Type ให้ชัดเจนเพื่อป้องกัน Browser เข้าใจผิดว่าเป็น Submit
        btn.setAttribute('type', 'button'); 
        
        btn.className = 'faq-btn';
        btn.innerText = opt.th;

        // ตกแต่งเพิ่มเล็กน้อยเพื่อให้เด่นกว่าปุ่ม FAQ ปกติ (Optional)
        btn.style.borderColor = "#4CAF50"; 
        btn.style.fontWeight = "bold";

        btn.onclick = (e) => {
            if (e) e.preventDefault(); // ป้องกันการทำงานซ้อนทับ
            console.log("👆 Clicked Option:", opt.th);
            
            stopAllSpeech(); 
            opt.action(); 
            
            return false;
        };
        
        container.appendChild(btn);
    });
    
    console.log("✅ Rendered " + options.length + " option buttons.");
}

// --- 🏠 6. ระบบ Splash Screen & Database Init ---

async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    const statusTxt = document.getElementById('splash-status-text');
    if (progBar) progBar.style.width = '30%';

    try {
        console.log("🌐 Connecting to GAS...");
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json && json.database) { 
            window.localDatabase = json.database; 
            completeLoading(); 
        } else { throw new Error(); }
    } catch (e) { 
        if (statusTxt) statusTxt.innerText = "กำลังลองเชื่อมต่อฐานข้อมูลใหม่...";
        setTimeout(initDatabase, 5000); 
    }
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
                resetToHome();
                initCamera();       
            }, 800);
        }
    }, 500);
}

function resetToHome() {
    if (window.isBusy || window.isSpeaking) return;
    stopAllSpeech(); forceStopAllMic(); 
    isAtHome = true; 
    window.allowWakeWord = false; 
    releaseSystemLock();
    displayResponse("กดปุ่มไมค์เพื่อเริ่มพูด");
    renderFAQButtons(); 
}

// --- 👁️ 7. ระบบดวงตา AI (Face Detection) ---

async function detectPerson() {
    if (typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
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

// --- 🎤 8. ระบบไมโครโฟน (Wake Word & STT) ---

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
        if (transcript.trim() !== "") {
            document.getElementById('userInput').value = transcript;
            getResponse(transcript);
        }
    };
    window.recognition.onend = () => { window.isListening = false; updateMicVisuals('idle'); };
}

function toggleListening() { stopAllSpeech(); forceStopAllMic(); window.isBusy = false; manualMicOverride = true; if (!window.recognition) initSpeechRecognition(); setTimeout(() => { try { window.recognition.start(); } catch (e) {} }, 200); }

// --- (Utilities อื่นๆ เหมือนเดิม) ---
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
