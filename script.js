/**
 * สมองกลน้องนำทาง - เวอร์ชั่น Ultra Stable + Debug Logs
 * แก้ไขปัญหา: ระบบค้างหน้าคำตอบและไม่ยอม Reset กลับหน้า Home
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer; 
let speechSafetyTimeout; 
const IDLE_TIME_LIMIT = 30000; // 30 วินาที
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

function updateInteractionTime() {
    lastSeenTime = Date.now();
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
 * 2. ระบบ Reset หน้าจอ (Smart Reset พร้อม Debug Log)
 */
function resetToHome() {
    const now = Date.now();
    const idleDuration = now - lastSeenTime;
    const noInteraction = (idleDuration > IDLE_TIME_LIMIT);

    // --- ส่วนวิเคราะห์ Debug: จะแสดงใน Console เมื่อใกล้ถึงเวลา Reset ---
    if (idleDuration > (IDLE_TIME_LIMIT * 0.8)) {
        console.groupCollapsed(`🔍 Checking Reset Conditions (${Math.floor(idleDuration/1000)}s idle)`);
        console.log("Is Busy (Speaking/Thinking):", window.isBusy);
        console.log("Person in Frame:", personInFrameTime !== null);
        console.log("No Interaction Triggered:", noInteraction);
        
        if (window.isBusy) console.warn("❌ Blocked by: isBusy (ระบบยังทำงานค้างอยู่)");
        if (personInFrameTime !== null) console.warn("❌ Blocked by: personInFrame (กล้องยังเห็นคน)");
        console.groupEnd();
    }

    // หากเงื่อนไขใดยังไม่พร้อม ให้เริ่มนับใหม่
    if (window.isBusy || personInFrameTime !== null || !noInteraction) {
        restartIdleTimer(); 
        return;
    }

    console.log("✅ [RESET] All conditions met. Returning to Home.");
    resetSystemState();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       

    const welcomeMsg = window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.";
    displayResponse(welcomeMsg);
    renderFAQButtons(); 
    restartIdleTimer();
}

function restartIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(resetToHome, 5000); // เช็คทุก 5 วินาทีเมื่อว่าง
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
            console.log("👤 Person Entered Frame");
            personInFrameTime = now;
        }
        const stayDuration = now - personInFrameTime;
        if (stayDuration >= 2000) {
            updateInteractionTime();
            if (!window.isBusy && !window.hasGreeted && stayDuration >= 3000) {
                greetUser();
            }
        }
        lastSeenTime = now; 
    } else {
        if (personInFrameTime !== null) {
            const timeSinceLastSeen = now - lastSeenTime;
            if (timeSinceLastSeen >= 5000) { 
                console.log("🚫 Person Left Frame (Grace period passed)");
                personInFrameTime = null;
                window.hasGreeted = false;
            }
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return; 
    console.log("👋 Greet User Triggered");
    forceUnmute();
    const hour = new Date().getHours();
    let thTime = hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 18 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีครับ");
    let enTime = hour < 12 ? "Good morning" : (hour < 18 ? "Good afternoon" : "Good day");

    const greetings = {
        th: [`${thTime} มีอะไรให้น้องนำทางช่วยไหมครับ?`, "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีครับ", "สอบถามข้อมูลกับน้องนำทางได้นะครับ"],
        en: [`${enTime}! How can I help you?`, "Welcome! How can I assist you today?"]
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
    
    console.log(`🧠 Processing Query: ${userQuery}`);
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');
    
    const fetchTimeout = setTimeout(() => {
        if (window.isBusy) {
            console.warn("⏳ Fetch Timeout: Forcing Unlock");
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
                    let score = 0;
                    if (query === key) score = 1.0;
                    else if (query.includes(key) && key.length > 3) score = 0.85;
                    else score = calculateSimilarity(query, key);

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
        } 
        else if (bestMatch.score >= 0.35) {
            const suggestMsg = (window.currentLang === 'th')
                ? `น้องนำทางไม่แน่ใจว่าใช่เรื่อง "${bestMatch.matchedKey}" หรือเปล่าครับ?`
                : `I'm not sure, did you mean "${bestMatch.matchedKey}"?`;
            displayResponse(suggestMsg);
            speak(suggestMsg);
            renderConfirmButtons(bestMatch.answer);
        } 
        else {
            const fallback = (window.currentLang === 'th') 
                ? "ขออภัย น้องนำทางไม่พบข้อมูลที่ตรงกันครับ" 
                : "I'm sorry, I couldn't find a matching answer.";
            displayResponse(fallback);
            speak(fallback);
        }
    } catch (err) {
        console.error("❌ getResponse Error:", err);
        clearTimeout(fetchTimeout);
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
    btnYes.style.background = "#f1fdf6";
    btnYes.innerHTML = (window.currentLang === 'th') ? '<i class="fas fa-check"></i> ใช่' : '<i class="fas fa-check"></i> Yes';
    
    btnYes.onclick = () => {
        console.log("✅ User confirmed suggestion");
        window.speechSynthesis.cancel();
        clearTimeout(speechSafetyTimeout);
        window.isBusy = false; 
        updateLottie('idle');
        displayResponse(answer);
        container.innerHTML = ""; 
        setTimeout(() => speak(answer), 250);
        setTimeout(renderFAQButtons, 8000); 
    };

    const btnNo = document.createElement('button');
    btnNo.className = 'faq-btn';
    btnNo.style.border = "2px solid #e74c3c";
    btnNo.style.background = "#fdf2f1";
    btnNo.innerHTML = (window.currentLang === 'th') ? '<i class="fas fa-times"></i> ไม่ใช่' : '<i class="fas fa-times"></i> No';
    
    btnNo.onclick = () => {
        console.log("❌ User rejected suggestion");
        resetSystemState();
        displayResponse((window.currentLang === 'th') ? "ขออภัยครับ ลองถามใหม่อีกครั้งนะ" : "Sorry, please try asking again.");
        renderFAQButtons(); 
    };

    container.appendChild(btnYes);
    container.appendChild(btnNo);
}

/**
 * 6. ระบบเสียง (พร้อม Hard Safety Timeout)
 */
function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    forceUnmute();
    
    // คำนวณเวลาพูด + Buffer 5 วินาที
    const safetyTime = (text.length * 200) + 5000;
    console.log(`📢 Speaking: "${text.substring(0, 30)}..." (Safety Timeout: ${safetyTime/1000}s)`);

    clearTimeout(speechSafetyTimeout);
    speechSafetyTimeout = setTimeout(() => {
        if (window.isBusy) {
            console.error("🚨 SPEECH TIMEOUT! Forcing window.isBusy = false");
            window.isBusy = false;
            updateLottie('idle');
        }
    }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    
    msg.onstart = () => {
        window.isBusy = true;
        updateLottie('talking');
    };
    
    msg.onend = () => { 
        console.log("🔊 Speech Ended Naturally");
        clearTimeout(speechSafetyTimeout);
        window.isBusy = false;
        updateLottie('idle'); 
        restartIdleTimer(); 
    };

    msg.onerror = (e) => {
        console.error("❌ SpeechSynthesis Error:", e);
        resetSystemState();
    };

    window.speechSynthesis.speak(msg);
}

/**
 * 7. ระบบเริ่มต้น
 */
async function initDatabase() {
    console.log("📂 Loading Database...");
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            console.log("🤖 Loading COCO-SSD Model...");
            cocoModel = await cocoSsd.load();
            console.log("🚀 System Ready!");
            resetSystemState();
            renderFAQButtons();
            initCamera(); 
            displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.");
        }
    } catch (e) { 
        console.error("❌ Init Error:", e);
        setTimeout(initDatabase, 5000); 
    }
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qThai = row[0] ? row[0].toString().trim() : "";
        const qEng  = row[1] ? row[1].toString().trim() : "";
        let btnText = (window.currentLang === 'th') ? qThai : qEng;
        
        if (btnText !== "") {
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
    if (player.src !== assets[state]) {
        player.load(assets[state]);
    }
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

/**
 * 8. ระบบดักจับ Event ปิดหน้าจอ
 */
const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    if (typeof speechSafetyTimeout !== 'undefined') clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    console.log("⏹ System Terminated.");
};

window.addEventListener('pagehide', stopAllSpeech);
window.addEventListener('beforeunload', stopAllSpeech);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopAllSpeech();
});
        
