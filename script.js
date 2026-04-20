/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Stable State Control)
 * สำหรับ: ตู้ Kiosk ขนส่งอำเภอพยัคฆภูมิพิสัย
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.isListening = false;
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

window.recognition = null; 
let wakeWordRecognition = null;
let manualMicOverride = false;
let micHardLock = false;
let isWakeWordActive = false;

// ================= 🎛️ MIC STATE CONTROL =================

function safeStartRecognition() {
    if (!window.recognition) initSpeechRecognition();
    if (!window.recognition || window.isListening) return;

    try {
        window.recognition.start();
    } catch (e) {
        console.warn("🎤 [Mic] Start fail:", e);
    }
}

function safeStopRecognition() {
    if (!window.recognition) return;
    try {
        window.recognition.abort(); // ใช้ abort เพื่อตัดการทำงานทันที
    } catch (e) {}
}

function setMicState(mode) {
    if (micHardLock && mode !== "OFF") {
        console.log("⛔ [Mic] Lock Active - Blocked mode:", mode);
        return;
    }
    
    console.log("🎛️ [System] MicMode ->", mode);
    safeStopRecognition();
    stopWakeWord();

    if (mode === "OFF") return;

    if (mode === "STT") {
        setTimeout(safeStartRecognition, 300);
    }

    if (mode === "WAKE") {
        if (!wakeWordRecognition) setupWakeWord();
        setTimeout(() => {
            isWakeWordActive = true;
            try { wakeWordRecognition.start(); } catch (e) {}
        }, 400);
    }
}

function toggleListening() {
    manualMicOverride = true; // ผู้ใช้กดเอง
    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) {
        safeStopRecognition();
    } else {
        safeStartRecognition();
    }
}

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 

    if (window.micTimer) clearTimeout(window.micTimer);
    if (window.sttTimeout) clearTimeout(window.sttTimeout);

    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }

    // ปรับระบบล็อค
    if (manualMicOverride) {
        micHardLock = false;
    } else if (window.isBusy) {
        micHardLock = true;
    } else {
        micHardLock = false;
    }
}

// ================= 🔊 SPEECH & AUDIO =================

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true; 

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    
    msg.onstart = () => updateLottie('talking');
    
    msg.onend = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
        if (callback) callback();

        if (!isAtHome) {
            setTimeout(() => {
                if (window.isBusy) return;
                
                if (isGreeting) {
                    window.allowWakeWord = true;
                    setMicState("WAKE");
                } else {
                    // ถ้าพูดจบแล้วไม่ใช่คำทักทาย ให้เปิดไมค์รอรับคำถาม (STT)
                    if (!manualMicOverride) {
                        setMicState("STT"); 
                        
                        if (window.sttTimeout) clearTimeout(window.sttTimeout);
                        window.sttTimeout = setTimeout(() => {
                            if (window.isListening && !manualMicOverride) {
                                setMicState("WAKE");
                            }
                        }, 7000); // รอ 7 วินาทีถ้าไม่มีคนพูด ให้กลับไปโหมดดักฟังชื่อ
                    }
                }
            }, 1500); 
        }
    };
    window.speechSynthesis.speak(msg);
}

// ================= 🎤 RECOGNITION SETUP =================

function initSpeechRecognition() {
    if (window.recognition) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = 'th-TH';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;

    window.recognition.onstart = () => {
        window.isListening = true;
        document.getElementById('micBtn')?.classList.add('recording');
        console.log("🎤 Mic START");
    };

    window.recognition.onresult = (e) => {
        if (window.micTimer) clearTimeout(window.micTimer);
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            transcript += e.results[i][0].transcript;
        }

        const inputField = document.getElementById('userInput');
        if (inputField && transcript.trim() !== "") {
            inputField.value = transcript;

            // 🚀 Auto Submit เมื่อหยุดพูด 2 วินาที
            window.micTimer = setTimeout(() => {
                const query = inputField.value.trim();
                if (query) {
                    safeStopRecognition();
                    inputField.value = "";
                    getResponse(query);
                }
            }, 2000);
        }
    };

    window.recognition.onend = () => {
        window.isListening = false;
        manualMicOverride = false; // คืนค่าเพื่อให้ระบบ Auto ทำงานต่อได้
        document.getElementById('micBtn')?.classList.remove('recording');
        console.log("🛑 Mic END");
    };
}

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = true;
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
        }

        if (text.includes("น้องนำทาง") || text.includes("นำทาง")) {
            console.log("🎯 WAKE WORD DETECTED");
            forceStopAllMic();
            const greetings = ["ครับผม มีอะไรให้ช่วยไหมครับ", "น้องนำทางมาแล้วครับ สอบถามได้เลย", "สวัสดีครับ เชิญสอบถามครับ"];
            speak(greetings[Math.floor(Math.random() * greetings.length)]);
        }
    };

    wakeWordRecognition.onend = () => {
        if (isWakeWordActive && !window.isBusy && !window.isListening) {
            setTimeout(() => {
                try { wakeWordRecognition.start(); } catch(e) {}
            }, 1000);
        }
    };
}

function stopWakeWord() {
    isWakeWordActive = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch (e) {} }
}

// ================= 🧠 CORE LOGIC (SEARCH & UI) =================

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");

    // Logic พิเศษสำหรับใบขับขี่
    if ((query.includes("ใบขับขี่") || query.includes("license")) && (query.includes("ต่อ") || query.includes("renew")) && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        const askMsg = "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?";
        displayResponse(askMsg); 
        speak(askMsg);
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary", action: () => startLicenseCheck("แบบชั่วคราว (2 ปี)") },
            { th: "แบบ 5 ปี", en: "5-year type", action: () => startLicenseCheck("แบบ 5 ปี") }
        ]);
        return;
    }

    try {
        let bestMatch = { answer: "", score: 0 };
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            window.localDatabase[sheetName].forEach(item => {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) return;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim());
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                
                for (const key of keyList) {
                    let score = (query === key) ? 10 : calculateSimilarity(query, key) * 5;
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                }
            });
        }

        if (bestMatch.score >= 2.5) { 
            displayResponse(bestMatch.answer); 
            speak(bestMatch.answer); 
        } else { 
            const noDataMsg = "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาสอบถามเรื่องอื่น หรือติดต่อเจ้าหน้าที่นะครับ";
            displayResponse(noDataMsg); 
            speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { window.isBusy = false; updateLottie('idle'); }
}

// ================= 👁️ VISION & IDLE =================

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;

    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withAgeAndGender();
        const face = predictions.find(f => f.detection.box.width > 90);

        if (face) {
            if (personInFrameTime === null) personInFrameTime = now;
            window.detectedGender = face.gender; 
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) { 
                greetUser(); 
            }
            lastSeenTime = now; 
        } else if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
            personInFrameTime = null; 
            window.hasGreeted = false; 
            setMicState("OFF");
            if (!isAtHome) restartIdleTimer();
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function resetToHome() {
    const now = Date.now();
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) return;
    if (isAtHome) return; 

    stopAllSpeech(); 
    forceStopAllMic(); 
    window.hasGreeted = false;
    isAtHome = true; 
    displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
    renderFAQButtons(); 
}

// ================= 🛠️ UI & HELPERS =================

function displayResponse(text) { 
    const el = document.getElementById('response-text');
    if (el) el.innerHTML = text.replace(/\n/g, '<br>'); 
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

// Initialization
async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            completeLoading(); 
        }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

document.addEventListener('DOMContentLoaded', initDatabase);
