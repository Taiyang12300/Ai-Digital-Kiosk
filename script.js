/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Refactored & Logic Fixed)
 * แก้ไข: ป้องกันการเปิดไมค์ซ้อน และจัดการสถานะ manualMicOverride ให้ถูกต้อง
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false; // ปรับให้ใช้ window ทั้งหมด
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
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

// --- 🚩 ปรับปรุง: แยกประเภทการกด (Manual vs Auto) ---
function toggleListening(isManual = true) { 
    // ถ้าคนกดเอง (isManual=true) ให้ Priority สูงสุด
    manualMicOverride = isManual;
    micHardLock = false; 

    window.speechSynthesis.cancel(); 
    if (window.micTimer) clearTimeout(window.micTimer);
    
    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) { 
        try { window.recognition.stop(); } catch (e) {}
        window.isListening = false;
        if (isManual) manualMicOverride = false; 
        console.log("🎤 [Mic] Toggled OFF");
        return; 
    } 

    forceStopAllMic(); 
    
    setTimeout(() => {
        try {
            micHardLock = false; 
            window.recognition.start(); 
            console.log("🎤 [Mic] Toggled ON (Manual: " + isManual + ")");
        } catch (e) { 
            console.error("Mic Start Error:", e);
            window.isListening = false;
        }
    }, 200); 
}

function stopListening() { 
    window.isListening = false;
    manualMicOverride = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.remove('recording'); 
}

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 

    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }

    if (manualMicOverride) {
        micHardLock = false;
    } else if (window.isBusy) {
        micHardLock = true;
    }
    console.log("🛑 [System] Mics Force Stopped (HardLock: " + micHardLock + ")");
}

// --- 1. Wake Word Setup (Fixed Callback) ---
function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }

    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        if (!window.allowWakeWord || window.isBusy || window.isListening) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            console.log("🎯 [WakeWord] Matched!");
            isWakeWordActive = false; 
            forceStopAllMic();        
            window.isBusy = true;     

            let msg = window.currentLang === 'th' 
                ? "ครับผม มีอะไรให้ช่วยไหมครับ?" 
                : "Yes! How can I help you?";
            
            displayResponse(msg);
            
            // ✅ แก้ไข: ส่ง toggleListening(false) เข้าไปเพื่อให้เปิด STT แต่ไม่ล็อค Override
            setTimeout(() => {
                speak(msg, () => {
                    toggleListening(false); 
                }); 
            }, 300); 
        }
    };

    wakeWordRecognition.onend = () => {
        if (manualMicOverride || micHardLock) return;
        if (!isAtHome && personInFrameTime !== null && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => {
                try {
                    if (!micHardLock && !window.isBusy && !window.isListening && isWakeWordActive) {
                        wakeWordRecognition.start(); 
                    }
                } catch(e) {}
            }, 1500); 
        }
    };
}

function startWakeWord() {
    if (manualMicOverride || window.isBusy || window.isListening) return;
    if (!window.allowWakeWord || isAtHome || window.isMuted) {
        isWakeWordActive = false;
        return;
    }
    try { 
        if (window.sttTimeout) clearTimeout(window.sttTimeout);
        forceStopAllMic();
        setTimeout(() => {
            if (!manualMicOverride && !window.isBusy) {
                micHardLock = false;
                isWakeWordActive = true; 
                wakeWordRecognition.start(); 
                console.log("🎤 [System] WakeWord Stand-by...");
            }
        }, 200);
    } catch (e) {}
}

// --- 2. Speak Function (Fixed Auto-Logic Conflict) ---
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

        // ✅ แก้ไขจุดขัดแย้ง: ถ้ามี callback ให้ทำแล้วหยุด (Return) ไม่ให้ไปรัน Auto-Logic ด้านล่างซ้ำ
        if (callback) {
            callback();
            return; 
        }

        if (!isAtHome) {
            setTimeout(() => {
                if (window.isBusy || manualMicOverride) return;

                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else {
                    if (!window.isListening && !manualMicOverride) {
                        toggleListening(false); // ระบบเปิดเอง

                        if (window.sttTimeout) clearTimeout(window.sttTimeout);
                        window.sttTimeout = setTimeout(() => {
                            if (window.isListening && !window.isBusy && !manualMicOverride) {
                                console.log("⏰ STT Timeout -> กลับไปรอฟังชื่อ");
                                forceStopAllMic(); 
                                window.allowWakeWord = true;
                                startWakeWord(); 
                            }
                        }, 6000); 
                    }
                }
            }, 2000); 
        }
    };
    window.speechSynthesis.speak(msg);
}

// --- ส่วนที่เหลือ (Database, Camera, Logic การตอบ) คงเดิม 100% ---

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;
    window.recognition.onstart = () => {
        window.isListening = true;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse(window.currentLang === 'th' ? "กำลังฟัง... พูดได้เลยครับ" : "Listening...");
    };
    window.recognition.onresult = (e) => {
        if (window.micTimer) clearTimeout(window.micTimer);
        let transcript = "";
        for (let i = 0; i < e.results.length; ++i) { transcript += e.results[i][0].transcript; }
        if (transcript.trim() !== "") {
            const inputField = document.getElementById('userInput');
            if (inputField) inputField.value = transcript;
            window.micTimer = setTimeout(() => {
                const finalQuery = inputField ? inputField.value.trim() : transcript.trim();
                if (finalQuery !== "") {
                    try { window.recognition.stop(); } catch(err) {} 
                    if (inputField) inputField.value = ""; 
                    getResponse(finalQuery); 
                }
            }, 2500); 
        }
    };
    window.recognition.onend = () => {
        window.isListening = false;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.remove('recording');
    };
}

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
    
    // Logic คัดกรองใบขับขี่
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

    // Logic ค้นหาใน Database
    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                for (const key of keyList) {
                    if (!key) continue;
                    let score = (query === key) ? 10.0 : calculateSimilarity(query, key) * 5;
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                }
            });
        }
        if (bestMatch.score >= 0.45) { displayResponse(bestMatch.answer); speak(bestMatch.answer); } 
        else { 
            const noData = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ" : "No info found.";
            displayResponse(noData); speak(noData);
        }
    } catch (err) { window.isBusy = false; }
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    forceUnmute(); isAtHome = false; window.hasGreeted = true; window.isBusy = true; 
    const now = new Date(); const hour = now.getHours();
    let timeGreet = hour < 12 ? "สวัสดีตอนเช้าครับ" : hour === 12 ? "สวัสดีตอนเที่ยงครับ" : hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ";
    const pType = (window.detectedGender === 'female') ? "คุณผู้หญิง" : "คุณผู้ชาย";
    const finalGreet = `${timeGreet} ${pType} มีอะไรให้ช่วยไหมครับ?`;
    displayResponse(finalGreet);
    speak(finalGreet, null, true); 
}

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            isAtHome = true; window.isBusy = false;
            displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อถามได้เลยครับ" : "Tap mic to speak.");
            renderFAQButtons(); initCamera();
        }, 800);
    }
}

// --- ฟังก์ชัน Helper ต่างๆ ---
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
    const assets = {
        'idle': 'https://lottie.host/568e8594-a319-4491-bf10-a0f5c012fc76/6S3urqybG5.json',
        'thinking': 'https://lottie.host/e742c203-f211-4521-a5aa-96cd5248d4b8/CKCd2cqmGj.json',
        'talking': 'https://lottie.host/79a24a65-7d74-4ff7-8ac5-bb3eeaa49073/4BES9eWBuE.json'
    };
    if (player) player.load(assets[state]);
}
function displayResponse(text) { 
    const el = document.getElementById('response-text');
    if (el) el.innerHTML = text.replace(/\n/g, '<br>'); 
}
function updateInteractionTime() { lastSeenTime = Date.now(); if (!isAtHome) restartIdleTimer(); }
function restartIdleTimer() { if (idleTimer) clearTimeout(idleTimer); if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT); }
function stopAllSpeech() { window.speechSynthesis.cancel(); window.isBusy = false; updateLottie('idle'); }
function forceUnmute() { window.isMuted = false; }
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { window.localDatabase = json.database; completeLoading(); }
    } catch (e) { setTimeout(initDatabase, 3000); }
}
async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { video.srcObject = stream; video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; }
    } catch (err) {}
}
async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        setupWakeWord(); requestAnimationFrame(detectPerson);
    } catch (err) {}
}
async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = predictions.find(f => f.detection.score > 0.55 && f.detection.box.width > 90);
        if (face) {
            if (personInFrameTime === null) personInFrameTime = now;
            window.detectedGender = face.gender;
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) greetUser();
            lastSeenTime = now; 
        } else if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
            personInFrameTime = null; window.hasGreeted = false; window.allowWakeWord = false; forceStopAllMic();
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initDatabase);
document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);
window.addEventListener('beforeunload', () => { stopAllSpeech(); forceStopAllMic(); });
