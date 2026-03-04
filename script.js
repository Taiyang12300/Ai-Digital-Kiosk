 /**
 * สมองกลน้องนำทาง - เวอร์ชั่น AI Smart Search & Conversation Flow
 * ปรับปรุงล่าสุด: เพิ่ม Debug Logs เพื่อเช็คสถานะการ Reset Home
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
let speechSafetyTimeout = null; 
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
    stopAllSpeech();
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    console.log("🖱️ Interaction detected. Resetting lastSeenTime.");
    if (!isAtHome) restartIdleTimer();
}

document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);

window.switchLanguage = function(lang) {
    resetSystemState(); 
    window.currentLang = lang;
    const welcomeMsg = (lang === 'th') ? "เปลี่ยนเป็นภาษาไทยแล้วครับ" : "Switched to English.";
    displayResponse(welcomeMsg);
    renderFAQButtons(); 
    isAtHome = false; 
    updateInteractionTime();
};

function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.classList.remove('muted');
}

/**
 * 2. ระบบ Reset หน้าจอ
 */
function resetToHome() {
    const now = Date.now();
    const idleTime = now - lastSeenTime;
    
    // Log สถานะการเช็ค Reset
    console.log(`⏳ [Reset Check] isBusy: ${window.isBusy}, personInFrame: ${personInFrameTime !== null}, Idle: ${Math.floor(idleTime/1000)}s/${IDLE_TIME_LIMIT/1000}s`);

    if (window.isBusy || personInFrameTime !== null || (idleTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) {
            console.log("🚫 [Reset Canceled] System is active or person detected.");
            restartIdleTimer(); 
        }
        return;
    }
    
    if (isAtHome) return; 

    console.log("🏠 [Reset Success] Returning to Home Screen.");
    resetSystemState();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       
    isAtHome = true; 

    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!isAtHome) {
        console.log("🔄 Idle Timer Restarted.");
        idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); 
    }
}

/**
 * 3. ระบบดวงตา AI
 */
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 } });
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => { video.play(); requestAnimationFrame(detectPerson); };
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
            console.log("👁️ [AI] Person entered frame.");
            personInFrameTime = now;
        }
        
        if (now - personInFrameTime >= 2000) {
            lastSeenTime = now; // รีเซ็ตเวลา idle เพราะยังมีคนยืนอยู่
            if (isAtHome && !window.isBusy && !window.hasGreeted && (now - personInFrameTime >= 1500)) {
                greetUser();
            }
        }
    } else if (personInFrameTime !== null) {
        // ถ้าคนหายไปเกิน 5 วินาที
        if (now - lastSeenTime >= 5000) {
            console.log("🚫 [AI] Person lost? Time since lost: " + Math.floor((now - lastSeenTime)/1000) + "s");
            personInFrameTime = null;
            window.hasGreeted = false;
            if (!isAtHome) restartIdleTimer(); 
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return; 
    
    forceUnmute();
    isAtHome = false; 
    
    const hour = new Date().getHours();
    let thTime = hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 18 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีครับ");
    
    const greetings = {
        th: [`${thTime} มีอะไรให้น้องนำทางช่วยไหมครับ?`, "สำนักงานขนส่งพยัคฆภูมิพิสัยสวัสดีครับ"],
        en: ["Hello! How can I assist you today?"]
    };
    
    const list = greetings[window.currentLang] || greetings['th'];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    
    console.log("👋 [AI] Greeting triggered: " + finalGreet);
    window.hasGreeted = true; 
    displayResponse(finalGreet);
    speak(finalGreet);
}

/**
 * 4. ระบบประมวลผลคำตอบ
 */
async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    console.log("📝 User Query: " + userQuery);

    if (window.isBusy) { stopAllSpeech(); window.isBusy = false; }
    isAtHome = false; 
    updateInteractionTime(); 
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");

    // Logic Search... (ตัดมาเฉพาะจุดที่ต้องเช็ค Log)
    try {
        let bestMatch = { answer: "", score: 0, debugKey: "" };
        // ... (ส่วนการค้นหาใน Database) ...
        
        // จำลองผลลัพธ์เพื่อ Log
        console.log(`🎯 Best Match: "${bestMatch.debugKey}" Score: ${bestMatch.score}`);

        if (bestMatch.score >= 0.4 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else {
            console.log("⚠️ No match found above 0.4");
            const fallback = "ขออภัยครับ น้องหาข้อมูลไม่พบ";
            displayResponse(fallback);
            speak(fallback);
        }
    } catch (err) { 
        console.error("❌ Search Error:", err);
        resetSystemState(); 
    }
}

/**
 * 5. ระบบเสียงและหยุดเสียง
 */
function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    forceUnmute();
    
    const safetyTime = (text.length * 200) + 5000;
    console.log(`🔊 [Speech] Speaking: "${text.substring(0,20)}..." (Safety: ${safetyTime}ms)`);
    
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    
    speechSafetyTimeout = setTimeout(() => {
        if (window.isBusy) {
            console.warn("⚠️ [Speech] Safety Timeout reached. Forcing isBusy = false.");
            window.isBusy = false; 
            updateLottie('idle'); 
            restartIdleTimer(); 
        }
    }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { 
        console.log("✅ [Speech] Finished.");
        if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
        window.isBusy = false; 
        updateLottie('idle'); 
        updateInteractionTime(); 
    };
    window.speechSynthesis.speak(msg);
}

const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    updateLottie('idle');
    console.log("🛑 [Speech] Manually Terminated.");
};

/**
 * 6. ระบบเริ่มต้น
 */
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            cocoModel = await cocoSsd.load();
            renderFAQButtons();
            initCamera(); 
            displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
        }
    } catch (e) { setTimeout(initDatabase, 5000); }
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    
    container.innerHTML = "";
    
    // ดึงข้อมูล FAQ จากแถวที่ 2 เป็นต้นไป (slice(1))
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        
        if (qText) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = qText;
            
            btn.onclick = () => {
                // --- ส่วนที่เพิ่มเพื่อให้กดแทรกขณะน้องพูดได้ ---
                stopAllSpeech();      // 1. หยุดเสียงที่กำลังพูดอยู่
                window.isBusy = false; // 2. ปลดล็อกสถานะเพื่อให้ getResponse เริ่มงานใหม่ได้ทันที
                // ---------------------------------------
                
                getResponse(qText);
            };
            
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
    player.load(assets[state]);
}

function displayResponse(text) {
    const box = document.getElementById('response-text');
    if (box) {
        // รองรับการเว้นบรรทัดจาก Google Sheets ให้แสดงผลสวยงาม
        box.innerHTML = text.replace(/\n/g, '<br>');
    }
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

initDatabase();
                        
function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return;
    container.innerHTML = ""; 
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn'; 
        btn.style.border = "2px solid var(--primary)"; 
        btn.style.backgroundColor = "#f0edff"; 
        btn.innerText = opt.t; 
        
        btn.onclick = () => {
            // --- ส่วนที่แก้ไขเพิ่ม ---
            stopAllSpeech();      // 1. หยุดเสียงที่กำลังพูดอยู่ทั้งหมด
            window.isBusy = false; // 2. ปลดล็อกสถานะเพื่อให้ getResponse ทำงานได้
            // -----------------------
            
            getResponse(opt.s); 
            
            setTimeout(() => {
                renderFAQButtons();
            }, 800); 
        };
        container.appendChild(btn);
    });
}
