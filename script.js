 /**
 * สมองกลน้องนำทาง - เวอร์ชั่น AI Smart Search & Conversation Flow
 * ปรับปรุงล่าสุด: ระบบค้นหาแบบ Token Matching (ฉลาดขึ้น), ถามคัดกรองใบขับขี่, และระบบหยุดเสียงสมบูรณ์
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
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer(); 
        return;
    }
    if (isAtHome) return; 

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
    if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); 
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
        if (personInFrameTime === null) personInFrameTime = now;
        if (now - personInFrameTime >= 2000) {
            lastSeenTime = now; 
            if (isAtHome && !window.isBusy && !window.hasGreeted && (now - personInFrameTime >= 3000)) {
                greetUser();
            }
        }
    } else if (personInFrameTime !== null && (now - lastSeenTime >= 5000)) {
        personInFrameTime = null;
        window.hasGreeted = false;
        if (!isAtHome) restartIdleTimer(); 
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return; 
    forceUnmute();
    isAtHome = false; 
    const hour = new Date().getHours();
    let thTime = hour < 12 ? "สวัสดีตอนเช้าครับ" : (hour < 18 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีครับ");
    const list = [
        `${thTime} มีอะไรให้น้องนำทางช่วยไหมครับ?`, 
        "สำนักงานขนส่งพยัคฆภูมิพิสัย ยินดีต้อนรับครับ!", 
        "สวัสดีครับ สอบถามข้อมูลเรื่องทำใบขับขี่หรือภาษีรถกับน้องได้นะครับ",
        "สวัสดีครับ วันนี้มาติดต่อราชการด้านไหนดีครับ?"
    ];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    window.hasGreeted = true; 
    displayResponse(finalGreet);
    speak(finalGreet);
}

/**
 * 4. ระบบประมวลผลคำตอบ (Smart Search AI Logic)
 */
async function getResponse(userQuery) {
    if (!userQuery || window.isBusy || !window.localDatabase) return;
    
    isAtHome = false; 
    updateInteractionTime(); 
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');

    // ล้างอักขระพิเศษและคำเชื่อมที่ไม่จำเป็นเบื้องต้น
    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");

    // --- [1. Conversation Flow: คัดกรองคำถามกว้าง] ---
    const isBroadLicense = (query === "ต่อใบขับขี่" || query === "ใบขับขี่หมดอายุ") && 
                           (!query.includes("ชั่วคราว") && !query.includes("5 ปี") && !query.includes("2 ปี"));

    if (isBroadLicense) {
        // ... (ส่วนการคัดกรองเหมือนเดิม) ...
        const askMsg = "ไม่ทราบว่าใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg);
        speak(askMsg);
        renderOptionButtons([
            { t: "แบบชั่วคราว (2 ปี)", s: "ต่อใบขับขี่ 2 ปี เป็น 5 ปี" },
            { t: "แบบ 5 ปี", s: "ต่อใบขับขี่ 5 ปี เป็น 5 ปี" },
        ]);
        window.isBusy = false; 
        return; 
    }

    // --- [2. Smart Search: High Intelligence Logic] ---
    try {
        fetch(`${GAS_URL}?query=${encodeURIComponent(query)}&action=logOnly`, { mode: 'no-cors' });
        let bestMatch = { answer: "", score: 0 };
        let foundExact = false;

        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName) || foundExact) continue;

            const rows = window.localDatabase[sheetName];
            for (const item of rows) {
                if (foundExact) break;

                const rawKeys = item[0] ? item[0].toString().toLowerCase().trim() : "";
                if (!rawKeys) continue;
                
                const keyList = rawKeys.split(/[,|]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "ไม่มีข้อมูล") : (item[2] || "No data");
                
                for (const key of keyList) {
                    let score = 0;
                    const lowerKey = key.toLowerCase();
                    
                    if (query === lowerKey) {
                        score = 2.0; 
                        foundExact = true;
                    } else {
                        // แยกคำที่ความยาวมากกว่า 1 (เพื่อเอาใจความสำคัญ)
                        const keyTokens = lowerKey.split(/[\s,/-]+/).filter(t => t.length > 1);
                        const queryTokens = query.split(/[\s,/-]+/).filter(t => t.length > 1);

                        // 1. Keyword Hit Score (นับคำสำคัญที่ตรงกัน)
                        let matchCount = 0;
                        keyTokens.forEach(kt => { if (query.includes(kt)) matchCount++; });
                        const tokenScore = keyTokens.length > 0 ? (matchCount / keyTokens.length) : 0;

                        // 2. Intent Alignment (เน้นจุดประสงค์เรื่อง เวลา/วันเปิด)
                        let intentBonus = 0;
                        const timeKeywords = ["เปิด", "วันไหน", "กี่โมง", "เมื่อไหร่", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"];
                        const isQueryTime = timeKeywords.some(w => query.includes(w));
                        const isKeyTime = timeKeywords.some(w => lowerKey.includes(w));
                        
                        // ถ้าคนถามถามเรื่องเวลา และหัวข้อใน Sheet เกี่ยวกับเวลา ให้โบนัสพิเศษ (+0.5)
                        if (isQueryTime && isKeyTime) {
                            intentBonus = 0.5;
                        }

                        const simScore = calculateSimilarity(query, lowerKey);
                        
                        // รวมคะแนน: โบนัสความตั้งใจสำคัญที่สุด (50%) ตามด้วยคำสำคัญ (40%) และความคล้าย (10%)
                        score = (intentBonus) + (tokenScore * 0.8) + (simScore * 0.2);
                    }

                    if (score > bestMatch.score) {
                        bestMatch = { answer: ans, score: score };
                    }
                    if (foundExact) break;
                }
            }
        }

        // --- [3. การตอบกลับ] ---
        // ปรับเกณฑ์ตัดสินใจ (Threshold) เป็น 0.55 เพื่อความแม่นยำ
        if (bestMatch.score >= 0.55) { 
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else {
            const fallback = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ ลองเลือกจากหัวข้อด้านล่างนะครับ" : "I couldn't find that.";
            displayResponse(fallback);
            speak(fallback);
            renderFAQButtons(); 
        }
    } catch (err) { resetSystemState(); restartIdleTimer(); }
}

/**
 * 5. ระบบเสียงและหยุดเสียง
 */
function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    forceUnmute();
    const safetyTime = (text.length * 200) + 5000;
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    
    speechSafetyTimeout = setTimeout(() => {
        if (window.isBusy) { window.isBusy = false; updateLottie('idle'); restartIdleTimer(); }
    }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { 
        if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
        window.isBusy = false; updateLottie('idle'); updateInteractionTime(); 
    };
    window.speechSynthesis.speak(msg);
}

const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    updateLottie('idle');
    console.log("🛑 Speech Terminated.");
};

window.addEventListener('pagehide', stopAllSpeech);
window.addEventListener('beforeunload', stopAllSpeech);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopAllSpeech(); });

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
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = qText;
            btn.onclick = () => getResponse(qText);
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
    
    // ล้างปุ่ม FAQ เดิมออกก่อนเพื่อแสดงตัวเลือกใหม่
    container.innerHTML = ""; 
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn'; // ใช้ Class เดียวกับปุ่ม FAQ เพื่อความสวยงาม
        
        // ปรับแต่งสไตล์เพิ่มเติมให้เด่นกว่าปกติ (Optional)
        btn.style.border = "2px solid #3498db";
        btn.style.backgroundColor = "#ebf5fb";
        btn.style.fontWeight = "bold";
        btn.style.color = "#2c3e50";
        
        btn.innerText = opt.t; // ข้อความบนปุ่ม (เช่น "แบบชั่วคราว (2 ปี)")
        
        // เมื่อคลิก ให้ส่งค่า s (คำค้นหา) ไปที่ getResponse อีกครั้ง
        btn.onclick = () => {
            getResponse(opt.s); 
        };
        
        container.appendChild(btn);
    });
}
