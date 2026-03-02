/**
 * สมองกลน้องนำทาง - เวอร์ชั่น Ultra Stable (Final Fix Reset Loop)
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
let isAtHome = true; // เพิ่มเพื่อเช็คว่าอยู่หน้าหลักหรือไม่ ป้องกัน Loop

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
    window.speechSynthesis.cancel();
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    window.isBusy = false;
    updateLottie('idle');
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    // ถ้าไม่อยู่หน้า Home ให้เริ่มนับถอยหลังเพื่อเตรียมกลับ Home
    if (!isAtHome) {
        restartIdleTimer();
    }
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
    isAtHome = false; // เมื่อเปลี่ยนภาษา ถือว่ามีการใช้งาน ไม่ใช่หน้า Home ปกติ
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

    // หากยังไม่พร้อม Reset (ยุ่งอยู่ หรือ มีคนอยู่ หรือ เวลายังไม่ครบ)
    if (window.isBusy || personInFrameTime !== null || !noInteraction) {
        // ถ้าเงื่อนไขยังไม่ครบ ให้มาเช็คใหม่ในอีก 5 วินาที
        restartIdleTimer(); 
        return;
    }

    // --- ส่วนที่ทำงานเมื่อต้องการกลับหน้า Home จริงๆ เท่านั้น ---
    if (isAtHome) return; // ถ้าอยู่หน้า Home อยู่แล้ว ไม่ต้องรันซ้ำ

    console.log("✅ [SUCCESS] Returning to Home Screen. Stopping Timer.");
    
    resetSystemState();
    forceUnmute(); 
    window.hasGreeted = false;      
    personInFrameTime = null;       
    isAtHome = true; // ตั้งสถานะว่าอยู่หน้า Home แล้ว

    const welcomeMsg = window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone to ask for information.";
    displayResponse(welcomeMsg);
    renderFAQButtons(); 

    // หยุด Timer ทันที
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    // เช็คสถานะทุก 5 วินาที
    idleTimer = setTimeout(resetToHome, 5000); 
}

/**
 * 3. ระบบดวงตา AI
 */
async function initCamera() {
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
    const person = predictions.find(p => p.class === "person" && p.score > 0.75);

    if (person) {
        if (personInFrameTime === null) {
            console.log("👤 Person Detected");
            personInFrameTime = now;
        }
        
        // ถ้าเจอคน ให้รีเซ็ตเวลาความเคลื่อนไหว และถ้าอยู่นิ่งๆ นานพอให้ทักทาย
        lastSeenTime = now;
        if (isAtHome) {
            const stayDuration = now - personInFrameTime;
            if (!window.isBusy && !window.hasGreeted && stayDuration >= 3000) {
                greetUser();
            }
        } else {
            // ถ้าไม่ได้อยู่หน้า Home (หน้าคำตอบ) ให้ต่อเวลา Reset ออกไป
            updateInteractionTime();
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
    isAtHome = false; // เมื่อเริ่มทักทาย ถือว่าเข้าสู่สถานะปฏิสัมพันธ์
    
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
    
    isAtHome = false; // มีการถามคำถาม เปลี่ยนสถานะเป็นไม่ว่าง
    updateInteractionTime(); 
    resetSystemState(); 
    window.isBusy = true;
    updateLottie('thinking');
    
    // ... (ส่วนที่เหลือของ getResponse เหมือนเดิม) ...
    // [ระลึกว่าต้องรันส่วน logic ค้นหาคำตอบที่นี่]
    // สมมติว่าเจอคำตอบแล้วเรียก speak(answer)
}

/**
 * 6. ระบบเสียง (Speech)
 */
function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    forceUnmute();
    
    const safetyTime = (text.length * 200) + 5000;
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    
    speechSafetyTimeout = setTimeout(() => {
        if (window.isBusy) {
            window.isBusy = false;
            updateLottie('idle');
        }
    }, safetyTime);

    const msg = new SpeechSynthesisUtterance(text.replace(/[*#-]/g, ""));
    msg.lang = (window.currentLang === 'th') ? 'th-TH' : 'en-US';
    msg.onstart = () => { window.isBusy = true; updateLottie('talking'); };
    msg.onend = () => { 
        console.log("🔊 Speech Finished");
        if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
        window.isBusy = false;
        updateLottie('idle'); 
        
        // พูดจบปุ๊บ เริ่มนับถอยหลังเพื่อเตรียมกลับ Home (30 วิ)
        isAtHome = false; 
        updateInteractionTime(); 
    };
    window.speechSynthesis.speak(msg);
}

// ... (ส่วนที่เหลือของ initDatabase และ FAQ Buttons เหมือนเดิม) ...
