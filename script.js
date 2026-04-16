/**
 * 🚀 สมองกลน้องนำทาง - เวอร์ชั่นสมบูรณ์ (Bilingual & Debug Mode)
 * ปรับปรุง: รองรับ 2 ภาษาในปุ่ม Option, ระบบคัดกรองใบขับขี่ 2 ภาษา และเพิ่ม Log สถานะ
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.isAtHome = true; 

window.GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
let speechSafetyTimeout = null; 
const IDLE_TIME_LIMIT = 15000; 
let video = document.getElementById('video');
let faceModel = null; 
window.isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

/**
 * 1. ระบบจัดการสถานะและความเสถียร
 */
function resetSystemState() {
    console.log("🧹 [System] Resetting State...");
    stopAllSpeech();
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    console.log("🖱️ [Log] Interaction detected. Timer Reset.");
    if (!window.window.isAtHome) restartIdleTimer();
}

document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);

window.switchLanguage = function(lang) {
    resetSystemState(); 
    window.currentLang = lang;
    const welcomeMsg = (lang === 'th') ? "เปลี่ยนเป็นภาษาไทยแล้วครับ" : "Switched to English.";
    displayResponse(welcomeMsg);
    renderFAQButtons(); 
    window.isAtHome = false; 
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
    console.log(`⏳ [Debug Reset] Busy: ${window.isBusy}, PersonInFrame: ${personInFrameTime !== null}, Idle: ${Math.floor((now - lastSeenTime)/1000)}s`);

    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!window.isAtHome) restartIdleTimer(); 
        return;
    }
    if (window.isAtHome) return; 

    console.log("🏠 [Action] Returning to Home Screen.");
    resetSystemState();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       
    window.isAtHome = true; 

    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons(); 
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!window.isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); 
}

/**
 * 3. ระบบดวงตา AI
 */
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 640, height: 480 } 
        });
        if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => { 
                video.play(); 
                // เริ่มโหลด Model และเริ่ม Detect
                loadAndStartDetection();
            };
        }
    } catch (err) { console.error("❌ Camera Error:", err); }
}

async function loadAndStartDetection() {
    // 🔗 ชี้ไปที่ Repository ของพี่โดยตรง
    const MODEL_URL = 'https://taiyang12300.github.io/model/'; 
    
    try {
        console.log("🧠 [AI] กำลังอัปเกรดดวงตาจาก GitHub...");
        // โหลดโมเดล 3 ตัวที่พี่มีใน GitHub เพื่อแยกเพศและอายุ
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        
        console.log("✅ [AI] ระบบวิเคราะห์บุคคล (ชาย/หญิง/อายุ) พร้อมทำงาน!");
        requestAnimationFrame(detectPerson);
    } catch (e) {
        console.error("❌ Model Load Error:", e);
    }
}

async function detectPerson() {
    if (!window.isDetecting || typeof faceapi === 'undefined') { 
        setTimeout(() => requestAnimationFrame(detectPerson), 1000); 
        return; 
    }

    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) {
        requestAnimationFrame(detectPerson);
        return;
    }
    lastDetectionTime = now;

    // 🎯 ใช้ faceapi ตรวจจับพร้อมวิเคราะห์อายุ/เพศ
    const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withAgeAndGender();
    
    const face = predictions.find(f => {
        const box = f.detection.box;
        const centerX = box.x + (box.width / 2);
        const prob = (f.detection.score * 100).toFixed(1);

        // แสดง Log รายละเอียดเหมือนหน้าจอ Debug ที่พี่เคยทำ
        if (f.detection.score > 0.5) {
            console.log(`👤 [Detected] ${f.gender} (${Math.round(f.age)} ปี) | Prob: ${prob}% | CX: ${centerX.toFixed(1)}`);
        }

        // เงื่อนไข: มั่นใจเกิน 75%, ยืนใกล้พอ (width > 80), และอยู่กลางจอ (CX: 349 โดยประมาณ)
        return f.detection.score > 0.75 && box.width > 80 && (centerX > 100 && centerX < 540);
    });

    if (face) {
        if (personInFrameTime === null) {
            console.log(`🎯 [Target Locked] พบ${face.gender === 'male' ? 'ผู้ชาย' : 'ผู้หญิง'} อายุประมาณ ${Math.round(face.age)} ปี`);
            personInFrameTime = now;
            
            // 💡 ทิปส์: พี่สามารถเอาค่า face.age ไปแยกทักทาย "เด็ก" หรือ "ผู้ใหญ่" ได้ที่นี่ครับ
            window.detectedAge = face.age; 
            window.detectedGender = face.gender;
        }
        window.PersonInFrame = true;
        const stayDuration = now - personInFrameTime;

        if (stayDuration >= 2000 && window.isAtHome && !window.isBusy && !window.hasGreeted) {
            greetUser(); 
        }
        lastSeenTime = now; 
    } else {
        const gap = now - lastSeenTime;
        if (personInFrameTime !== null && gap >= 2500) {
            personInFrameTime = null;   
            window.hasGreeted = false;  
            if (!window.isAtHome) restartIdleTimer(); 
        }
    }
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return; 
    forceUnmute();
    window.isAtHome = false; 
    
    const hour = new Date().getHours();
    const isThai = window.currentLang === 'th';
    const gender = window.detectedGender; // 'male' หรือ 'female'

    // 1. ทักทายตามช่วงเวลา
    let timeGreet = "";
    if (isThai) {
        timeGreet = (hour < 12) ? "สวัสดีตอนเช้าครับ" : (hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ");
    } else {
        timeGreet = (hour < 12) ? "Good morning" : (hour < 17 ? "Good afternoon" : "Good evening");
    }

    // 2. แยกสรรพนามแค่ ชาย/หญิง (ตัดเรื่องอายุออกตามที่พี่ต้องการ)
    let personType = "";
    if (isThai) {
        personType = (gender === 'male') ? "คุณผู้ชาย" : "คุณผู้หญิง";
    } else {
        personType = (gender === 'male') ? "Sir" : "Madam";
    }

    // 3. คลังประโยคทักทาย (สุ่มเหมือนเดิมแต่เน้นสรรพนามเพศ)
    const greetings = {
        th: [
            `${timeGreet}${personType} มีอะไรให้น้องนำทางช่วยดูแลไหมครับ?`,
            `สวัสดีครับ${personType} ยินดีต้อนรับสู่สำนักงานขนส่งพยัคฆภูมิพิสัยครับ`,
            `${timeGreet}ครับ เชิญ${personType}สอบถามข้อมูลการทำใบขับขี่กับผมได้เลยครับ`,
            `สวัสดีครับ ผมน้องนำทาง ยินดีที่ได้ให้บริการ${personType}ครับ วันนี้มาติดต่อเรื่องอะไรดีครับ?`
        ],
        en: [
            `${timeGreet}, ${personType}! How can I assist you today?`,
            `Welcome! How can I help you, ${personType}?`,
            `Hello! I'm Nong Nam Thang. Need any help with our services, ${personType}?`
        ]
    };
    
    const list = greetings[window.currentLang] || greetings['th'];
    let finalGreet = list[Math.floor(Math.random() * list.length)];
    
    console.log("👋 [AI Action]: " + finalGreet);
    window.hasGreeted = true; 
    
    displayResponse(finalGreet);
    speak(finalGreet);
}

/**
 * 4. ระบบประมวลผลคำตอบ (Smart Search AI Logic)
 */
/**
 * ✅ ฟังก์ชันเสริม: ส่งคำถามไปบันทึกลง Google Sheets (FAQ)
 */
async function logQuestionToSheet(userQuery) {
    if (!userQuery || !GAS_URL) return;
    try {
        // ส่ง query ไปที่ GAS โดยระบุ action=logOnly เพื่อให้ฝั่ง Apps Script ทำงานในส่วนบันทึก FAQ
        const finalUrl = `${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`;
        
        // ใช้ mode: 'no-cors' เพื่อให้ส่งข้อมูลออกไปได้โดยไม่ติดปัญหาเรื่องความปลอดภัยของเบราว์เซอร์
        await fetch(finalUrl, { mode: 'no-cors' });
        console.log("📊 [Log] บันทึกสถิติคำถามลง Google Sheet เรียบร้อย");
    } catch (e) {
        console.error("❌ [Log] ไม่สามารถส่งข้อมูลไปบันทึกได้:", e);
    }
}

/**
 * 🚀 ฟังก์ชันประมวลผลคำตอบ (ฉบับปรับปรุง: เพิ่มระบบบันทึก Log)
 */
async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    console.log("📝 [User Query]: " + userQuery);

    // 🚩 บรรทัดที่เพิ่มใหม่: บันทึกคำถามลง Sheet ทุกครั้งที่มีคนถาม
    logQuestionToSheet(userQuery);

    if (window.isBusy) { stopAllSpeech(); window.isBusy = false; }
    window.isAtHome = false; 
    updateInteractionTime(); 
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");

    // --- [1. คัดกรองคำถามกว้าง - รองรับ 2 ภาษา] ---
    const isLicense = query.includes("ใบขับขี่") || query.includes("license");
    const isRenew = query.includes("ต่อ") || query.includes("renew");

    if (isLicense && isRenew && !query.includes("ชั่วคราว") && !query.includes("temporary") && !query.includes("5 ปี") && !query.includes("5ปี")) {
        const askMsg = (window.currentLang === 'th') 
            ? "ไม่ทราบว่าใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" 
            : "Is your license a Temporary (2-year) or a 5-year type?";
        displayResponse(askMsg);
        speak(askMsg);
        
        // เมื่อขึ้นปุ่มตัวเลือก เราจะส่งค่าไปถามต่อ และค่าใหม่จะถูกบันทึกเมื่อกดปุ่มนั้นๆ
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", s_th: "ต่อใบขับขี่ชั่วคราว", s_en: "renew temporary license" },
            { th: "แบบ 5 ปี", en: "5-year type", s_th: "ต่อใบขับขี่ 5 ปี เป็น 5 ปี", s_en: "renew 5 year license" },
        ]);
        window.isBusy = false; 
        return; 
    }

    try {
        let bestMatch = { answer: "", score: 0, debugKey: "" };

        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            const rows = window.localDatabase[sheetName];
            for (const item of rows) {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) continue;
                
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim()).filter(k => k !== "");
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                
                for (const key of keyList) {
                    let score = 0;
                    const lowerKey = key.toLowerCase();
                    if (query === lowerKey) {
                        score = 10.0;
                    } else {
                        const keyTokens = lowerKey.split(/[\s,/-]+/).filter(t => t.length > 1);
                        let matchCount = 0;
                        keyTokens.forEach(kt => { if (query.includes(kt)) matchCount++; });
                        let tokenScore = keyTokens.length > 0 ? (matchCount / keyTokens.length) : 0;
                        let simScore = calculateSimilarity(query, lowerKey);

                        let yearBonus = 0;
                        const isQ5 = query.includes("5 ปี") || query.includes("5ปี") || query.includes("5 year");
                        const isQ2 = query.includes("2 ปี") || query.includes("2ปี") || query.includes("ชั่วคราว") || query.includes("temporary");
                        const isK5 = lowerKey.includes("5 ปี") || lowerKey.includes("5ปี");
                        const isK2 = lowerKey.includes("2 ปี") || lowerKey.includes("2ปี") || lowerKey.includes("ชั่วคราว");

                        if (isQ5 && isK5) yearBonus = 2.0;
                        if (isQ2 && isK2) yearBonus = 2.0;
                        if ((isQ5 && isK2) || (isQ2 && isK5)) yearBonus = -5.0;

                        score = (tokenScore * 5) + (simScore * 1) + yearBonus;
                    }

                    if (score > bestMatch.score) {
                        bestMatch = { answer: ans, score: score, debugKey: lowerKey };
                    }
                }
            }
        }

        console.log(`🎯 [Match Found]: "${bestMatch.debugKey}" Score: ${bestMatch.score}`);

        if (bestMatch.score >= 0.4 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
        } else {
            console.warn("⚠️ [No Match] Score too low.");
            const fallback = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ ลองเลือกจากหัวข้อด้านล่างนะครับ" : "I couldn't find that. Please try the topics below.";
            displayResponse(fallback);
            speak(fallback);
            renderFAQButtons(); 
        }
    } catch (err) { console.error(err); resetSystemState(); }
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
        if (window.isBusy) { 
            console.warn("🛡️ [Speech] Safety Timeout triggered.");
            window.isBusy = false; updateLottie('idle'); restartIdleTimer(); 
        }
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
    console.log("🛑 [Action] Speech Terminated.");
};

window.addEventListener('pagehide', stopAllSpeech);
window.addEventListener('beforeunload', stopAllSpeech);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopAllSpeech(); });

/**
 * 6. ระบบ UI และปุ่ม
 */
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL, { redirect: 'follow' });
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            
            // 🚩 แก้ไขจุดนี้: เปลี่ยนจาก cocoSsd.load() เป็น blazeface.load()
            faceModel = await blazeface.load(); 
            
            renderFAQButtons();
            initCamera(); 
            displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
            console.log("✅ [System] Database & Face Model Ready.");
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
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button');
            btn.className = 'faq-btn';
            btn.innerText = qText;
            btn.onclick = () => { stopAllSpeech(); window.isBusy = false; getResponse(qText); };
            container.appendChild(btn);
        }
    });
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return;
    container.innerHTML = ""; 
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'faq-btn'; 
        btn.style.border = "2px solid var(--primary, #6366f1)"; 
        btn.style.backgroundColor = "#f0edff"; 
        
        // ✅ ปรับเป็น 2 ภาษา
        btn.innerText = (window.currentLang === 'th') ? opt.th : (opt.en || opt.th); 
        
        btn.onclick = () => {
            stopAllSpeech();
            window.isBusy = false;
            // ✅ เลือก Search Query ตามภาษา
            const query = (window.currentLang === 'th') ? opt.s_th : (opt.s_en || opt.s_th);
            getResponse(query); 
            setTimeout(renderFAQButtons, 800); 
        };
        container.appendChild(btn);
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
    if (box) box.innerHTML = text.replace(/\n/g, '<br>');
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
