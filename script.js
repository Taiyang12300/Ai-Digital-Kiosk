/**
 * สมองกลน้องนำทาง - เวอร์ชั่น Ultra Stable (Fix Reset Loop)
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer; 
let speechSafetyTimeout; 
const IDLE_TIME_LIMIT = 30000; 
let video = document.getElementById('video');
let cocoModel = null; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 500; 

/**
 * 1. ระบบจัดการสถานะและความเสถียร
 */
function resetSystemState() {
    console.log("🧹 Resetting System State...");
    window.speechSynthesis.cancel();
    clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    updateLottie('idle');
}

// ฟังก์ชันสำหรับปลุกระบบให้เริ่มนับถอยหลังใหม่
function updateInteractionTime() {
    lastSeenTime = Date.now();
    // เริ่มนับถอยหลังใหม่เฉพาะเมื่อมีการเคลื่อนไหวหรือสัมผัส
    restartIdleTimer();
}

document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);

window.switchLanguage = function(lang) {
    console.log(`🌐 Switching language to: ${lang}`);
    resetSystemState(); 
    window.currentLang = lang;
    const welcomeMsg = (lang === 'th') 
        ? "เปลี่ยนเป็นภาษาไทยแล้วครับ มีอะไรให้ช่วยไหม?" 
        : "Switched to English. How can I help you?";
    displayResponse(welcomeMsg);
    renderFAQButtons(); 
    updateInteractionTime();
};

function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    const muteIcon = document.getElementById('muteIcon');
    if (muteBtn) {
        muteBtn.classList.remove('muted');
        if (muteIcon) muteIcon.className = 'fas fa-volume-up';
    }
}

/**
 * 2. ระบบ Reset หน้าจอ (Smart Reset - Fixed Loop)
 */
function resetToHome() {
    const now = Date.now();
    const idleDuration = now - lastSeenTime;
    const noInteraction = (idleDuration >= IDLE_TIME_LIMIT);

    // Debug เช็คสถานะก่อน Reset
    if (idleDuration > (IDLE_TIME_LIMIT * 0.8)) {
        console.groupCollapsed(`🔍 Check Reset: ${Math.floor(idleDuration/1000)}s idle`);
        console.log("isBusy:", window.isBusy, "| Person:", personInFrameTime !== null);
        console.groupEnd();
    }

    // หากยังไม่พร้อม Reset (ยุ่งอยู่ หรือ มีคนอยู่ หรือ เวลายังไม่ครบ)
    if (window.isBusy || personInFrameTime !== null || !noInteraction) {
        restartIdleTimer(); // รอตรวจรอบถัดไป
        return;
    }

    // --- จุดแก้ไขหลัก: ทำงานที่นี่เมื่อต้องการกลับหน้า Home จริงๆ เท่านั้น ---
    console.log("✅ [SUCCESS] Returning to Home Screen.");
    
    resetSystemState();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       

    const welcomeMsg = window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.";
    displayResponse(welcomeMsg);
    renderFAQButtons(); 

    // *** ไม่ต้องเรียก restartIdleTimer() ที่นี่ เพื่อหยุดการ Loop ***
    clearTimeout(idleTimer); 
}

function restartIdleTimer() {
    clearTimeout(idleTimer);
    // ตรวจสอบสถานะทุก 5 วินาทีเมื่อเริ่มนับถอยหลัง
    idleTimer = setTimeout(resetToHome, 5000); 
}

/**
 * 3. ระบบดวงตา AI
 */
async function initCamera() {
    console.log("📷 Initializing Camera...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 320, height: 240 } 
        });
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => { 
                video.play(); 
                requestAnimationFrame(detectPerson); 
            };
        }
    } catch (err) { console.error("❌ Camera Error:", err); }
}

async function detectPerson() {
    if (!isDetecting || !cocoModel) { 
        setTimeout(() => requestAnimationFrame(detectPerson), 1000); 
        return; 
    }

    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) {
        requestAnimationFrame(detectPerson);
        return;
    }
    lastDetectionTime = now;

    const predictions = await cocoModel.detect(video);
    const person = predictions.find(p => p.class === "person" && p.score > 0.75 && p.bbox[2] > 130);

    if (person) {
        if (personInFrameTime === null) {
            console.log("👤 Person Detected");
            personInFrameTime = now;
        }
        updateInteractionTime(); // ทุกครั้งที่เจอคน ให้รีเซ็ตเวลา Idle
        
        const stayDuration = now - personInFrameTime;
        if (!window.isBusy && !window.hasGreeted && stayDuration >= 3000) {
            greetUser();
        }
    } else {
        if (personInFrameTime !== null) {
            const timeSinceLastSeen = now - lastSeenTime;
            if (timeSinceLastSeen >= 5000) { 
                console.log("🚫 Area Cleared");
                personInFrameTime = null;
                window.hasGreeted = false;
            }
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return; 
    forceUnmute();
    const hour = new Date().getHours();
    let thTime = hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 18 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีครับ");
    const greetings = {
        th: [`${thTime} มีอะไรให้น้องนำทางช่วยไหมครับ?`, "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีครับ"],
        en: ["Welcome! How can I assist you today?"]
    };
    const list = greetings[window.currentLang] || greetings['th'];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    window.hasGreeted = true; 
    displayResponse(finalGreet);
    speak(finalGreet);
}

/**
 * 4. ระบบประมวลผลคำตอบ
 */
async function getResponse(userQuery) {
    if (!userQuery || window.isBusy || !window.localDatabase) return;
    
    updateInteractionTime(); // มีการใช้งานปุ่ม ให้รีเซ็ตเวลา Idle
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');
    
    const fetchTimeout = setTimeout(() => {
        if (window.isBusy) {
            window.isBusy = false;
            displayResponse("ขออภัยครับ ระบบประมวลผลล่าช้า ลองใหม่อีกครั้งนะครับ");
            updateLottie('idle');
        }
    }, 10000);

    try {
        fetch(`${GAS_URL}?query=${encodeURIComponent(userQuery.trim())}&action=logOnly`, { mode: 'no-cors' });
        const query = userQuery.toLowerCase().trim();
        let bestMatch = { answer: "", score: 0, matchedKey: "" };

        Object.keys(window.localDatabase).forEach(sheetName => {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) return;
            window.localDatabase[sheetName].forEach((item) => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase().trim() : "";
                if (!rawKeys) return;
                const keyList = rawKeys.split(/[,|]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "ไม่มีข้อมูล") : (item[2] || "No data");
                
                keyList.forEach(key => {
                    let score = (query === key) ? 1.0 : (query.includes(key) && key.length > 3 ? 0.85 : calculateSimilarity(query, key));
                    if (score > bestMatch.score) {
                        bestMatch = { answer: ans, score: score, matchedKey: key };
                    }
                });
            });
        });

        clearTimeout(fetchTimeout);
        if (bestMatch.score >= 0.8) {
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else if (bestMatch.score >= 0.35) {
            const suggestMsg = window.currentLang === 'th' ? `น้องนำทางไม่แน่ใจว่าใช่เรื่อง "${bestMatch.matchedKey}" หรือเปล่าครับ?` : `Did you mean "${bestMatch.matchedKey}"?`;
            displayResponse(suggestMsg);
            speak(suggestMsg);
            renderConfirmButtons(bestMatch.answer);
        } else {
            const fallback = window.currentLang === 'th' ? "ขออภัย น้องนำทางไม่พบข้อมูลครับ" : "I couldn't find a matching answer.";
            displayResponse(fallback);
            speak(fallback);
        }
    } catch (err) {
        resetSystemState();
    }
}

/**
 * 5. ระบบปุ่มยืนยัน
 */
function renderConfirmButtons(answer) {
    const container = document.getElementById('faq-container');
    if (!container) return;
    container.innerHTML = ""; 

    const btnYes = document.createElement('button');
    btnYes.className = 'faq-btn';
    btnYes.style.border = "2px solid #2ecc71";
    btnYes.innerHTML = window.currentLang === 'th' ? '<i class="fas fa-check"></i> ใช่' : 'Yes';
    btnYes.onclick = () => {
        updateInteractionTime();
        resetSystemState();
        displayResponse(answer);
        container.innerHTML = ""; 
        setTimeout(() => speak(answer), 250);
        setTimeout(renderFAQButtons, 8000); 
    };

    const btnNo = document.createElement('button');
    btnNo.className = 'faq-btn';
    btnNo.style.border = "2px solid #e74c3c";
    btnNo.innerHTML = window.currentLang === 'th' ? '<i class="fas fa-times"></i> ไม่ใช่' : 'No';
    btnNo.onclick = () => {
        resetSystemState();
        renderFAQButtons(); 
    };

    container.appendChild(btnYes);
    container.appendChild(btnNo);
}

/**
 * 6. ระบบเสียง (Speech)
 */
function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    forceUnmute();
    
    const safetyTime = (text.length * 200) + 5000;
    console.log(`📢 Speaking... (Timeout: ${safetyTime/1000}s)`);

    clearTimeout(speechSafetyTimeout);
    speechSafetyTimeout = setTimeout(() => {
        if (window.isBusy) {
            console.error("🚨 SPEECH TIMEOUT - Forcing Reset");
            window.isBusy = false;
            updateLottie('idle');
        }
    }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { 
        console.log("🔊 Speech Finished");
        clearTimeout(speechSafetyTimeout);
        window.isBusy = false;
        updateLottie('idle'); 
        updateInteractionTime(); // พูดจบปุ๊บ เริ่มนับถอยหลัง Reset ใหม่
    };
    window.speechSynthesis.speak(msg);
}

/**
 * 7. ระบบเริ่มต้นและแสดงผล
 */
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            cocoModel = await cocoSsd.load();
            resetSystemState();
            renderFAQButtons();
            initCamera(); 
            displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
            console.log("🚀 System Online");
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const btnText = (window.currentLang === 'th') ? row[0] : row[1];
        if (btnText) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = btnText;
            btn.onclick = () => getResponse(btnText);
            container.appendChild(btn);
        }
    });
}

function updateLottie(state) {
    const player = document.getElementById('lottie-canvas');
    if (!player) return;
    const assets = {
        'idle': 'https://lottie.host/568e8594-a319-4491-bf10-a0f5c012fc76/6S3urqybG5.json',
        'thinking': 'https://lottie.host/e742c203-f211-4521-a5aa-96cd5248d4b8/CKCd2cqmGj.json',
        'talking': 'https://lottie.host/79a24a65-7d74-4ff7-8ac5-bb3eeaa49073/4BES9eWBuE.json'
    };
    if (player.src !== assets[state]) player.load(assets[state]);
}

function displayResponse(text) {
    const box = document.getElementById('response-text');
    if (box) box.innerText = text;
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
                if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                    newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue; lastValue = newVal;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

initDatabase();

const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    window.isBusy = false;
};
window.addEventListener('pagehide', stopAllSpeech);
window.addEventListener('beforeunload', stopAllSpeech);
