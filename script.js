/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Stable Mic & Manual Override)
 * แก้ไข: ปุ่มไมค์กดได้เสมอ (Manual Override) แม้ระบบกำลังพูด
 * ปรับปรุง: แยกสถานะการเปิดไมค์ (Manual/Auto) และแก้ปัญหาไมค์ตีกันด้วยระบบ Queue
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
window.micActivationMode = null; // 'manual' | 'auto'
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let idleTimer = null; 
let speechSafetyTimeout = null;
const IDLE_TIME_LIMIT = 5000; 
let video; 
let isDetecting = true; 
let personInFrameTime = null; 
let lastSeenTime = Date.now();
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 200; 

let wakeWordRecognition;
let isWakeWordActive = false;

// --- 🚩 ฟังก์ชันควบคุม Splash Screen ---
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
                isAtHome = true;
                window.isBusy = false;
                window.hasGreeted = false;
                window.allowWakeWord = false; 

                const homeMsg = (window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                displayResponse(homeMsg);
                renderFAQButtons(); 
                initCamera();       
                console.log("🏠 [System] Home screen ready.");
            }, 800);
        }
    }, 500);
}

// --- 🚩 ฟังก์ชันจัดการไมค์และเสียง (หัวใจหลักที่แก้ไข) ---

function forceStopAllMic() {
    isWakeWordActive = false;
    if (typeof isListening !== 'undefined') isListening = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    console.log("🛑 [System] All Microphones Released.");
}

/**
 * ฟังก์ชันเปิดไมค์ STT แบบรวมศูนย์
 * @param {string} mode - 'manual' เมื่อกดปุ่มเอง, 'auto' เมื่อน้องเปิดให้หลังพูดจบ
 */
function activateSTT(mode = 'manual') {
    console.log(`🎤 Mic Activation: ${mode}`);
    
    // หยุดการทำงานอื่นทันทีเพื่อให้กดแทรกได้
    stopAllSpeech(); 
    forceStopAllMic();
    
    window.isBusy = false; 
    window.micActivationMode = mode;

    // หน่วงเวลาเล็กน้อยให้ Hardware เคลียร์สถานะ
    setTimeout(() => {
        if (typeof toggleListening === "function") {
            toggleListening(); 
        }
    }, 300);
}

function playAudioLink(url, callback = null) {
    if (!url) return;
    stopAllSpeech(); 
    forceStopAllMic(); 
    window.isBusy = true;
    updateLottie('talking');
    const audio = new Audio(url);
    audio.onended = () => {
        window.isBusy = false;
        updateLottie('idle');
        updateInteractionTime();
        if (callback) callback();
        else if (window.allowWakeWord && !isAtHome) setTimeout(startWakeWord, 1000);
    };
    audio.onerror = () => { window.isBusy = false; updateLottie('idle'); };
    audio.play().catch(e => { window.isBusy = false; });
}

// --- 1. ระบบ Wake Word ---

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }

    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (!window.allowWakeWord || window.isBusy || isListeningNow) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            console.log("🎯 Keyword Matched!");
            forceStopAllMic(); 
            window.isBusy = true;

            let msg = window.currentLang === 'th' 
                ? "ครับผม มีอะไรให้น้องนำทางช่วยไหมครับ?" 
                : "Yes! How can I help you?";
            
            displayResponse(msg);
            speak(msg); 
        }
    };

    wakeWordRecognition.onend = () => {
        const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
        if (window.allowWakeWord && isWakeWordActive && !window.isBusy && !isListeningNow) {
            setTimeout(() => {
                try { 
                    if (!window.isBusy && isWakeWordActive) wakeWordRecognition.start(); 
                } catch(e) { isWakeWordActive = false; }
            }, 500);
        }
    };
}

function startWakeWord() {
    const isListeningNow = typeof isListening !== 'undefined' ? isListening : false;
    if (!window.allowWakeWord || isAtHome || isListeningNow || window.isMuted || window.isBusy) {
        isWakeWordActive = false;
        return;
    }
    try { 
        isWakeWordActive = true; 
        wakeWordRecognition.start(); 
        console.log("🎤 [System] WakeWord Stand-by...");
    } catch (e) {}
}

function stopWakeWord() {
    isWakeWordActive = false; 
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch (e) {} }
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    if (!isAtHome) restartIdleTimer();
}

// --- 2. ระบบดวงตา AI ---

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        setupWakeWord(); 
        requestAnimationFrame(detectPerson);
    } catch (err) { console.error("❌ AI Model Load Failed"); }
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
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
            window.detectedGender = face.gender; 
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) { greetUser(); }
            lastSeenTime = now; 
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
                personInFrameTime = null; window.hasGreeted = false; window.allowWakeWord = false; forceStopAllMic(); 
                if (!isAtHome) restartIdleTimer();
            }
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    forceUnmute(); 
    isAtHome = false; 
    window.hasGreeted = true; 
    window.isBusy = true; 

    const gender = window.detectedGender || 'male';
    let finalGreet = window.currentLang === 'th' 
        ? `สวัสดีครับ${gender === 'male' ? 'คุณผู้ชาย' : 'คุณผู้หญิง'} มีอะไรให้น้องนำทางช่วยไหมครับ?`
        : `Hello, how can I help you?`;

    displayResponse(finalGreet);
    speak(finalGreet, () => { 
        window.isBusy = false; 
        window.allowWakeWord = true; 
        startWakeWord();
    }, true); 
}

// --- 3. ระบบประมวลผลคำตอบ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    logQuestionToSheet(userQuery); 
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim();
    
    // Logic คัดกรองใบขับขี่ (คงเดิมแต่ปรับปรุงสิทธิ์)
    if ((query.includes("ใบขับขี่") || query.includes("ต่อ")) && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        const askMsg = (window.currentLang === 'th') ? "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is it Temporary or 5-year?";
        displayResponse(askMsg); 
        speak(askMsg, () => { window.isBusy = false; });
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", s_th: "ต่อใบขับขี่ชั่วคราว", action: () => { startLicenseCheck("แบบชั่วคราว (2 ปี)"); } },
            { th: "แบบ 5 ปี", en: "5-year type", s_th: "ต่อใบขับขี่ 5 ปี เป็น 5 ปี", action: () => { startLicenseCheck("แบบ 5 ปี"); } }
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
                    let simScore = calculateSimilarity(query, key);
                    if (simScore > bestMatch.score) bestMatch = { answer: ans, score: simScore };
                }
            });
        }
        if (bestMatch.score >= 0.7) { 
            displayResponse(bestMatch.answer); speak(bestMatch.answer); 
        } else { 
            const noDataMsg = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ" : "No info found.";
            displayResponse(noDataMsg); speak(noDataMsg);
        }
    } catch (err) { window.isBusy = false; }
}

// --- 4. ระบบเสียง (Speech Synthesis) ---

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
        if (callback) callback();

        // หลังจากตอบคำถามเสร็จ ให้เปิดไมค์ STT อัตโนมัติ (Auto Mode)
        if (window.allowWakeWord && !isAtHome && !isGreeting) {
            setTimeout(() => {
                if (!window.isBusy) activateSTT('auto');
            }, 800);
        } else if (isGreeting) {
            setTimeout(startWakeWord, 1000);
        }
    };

    // Safety Timeout กันค้าง
    if (speechSafetyTimeout) clearTimeout(speechSafetyTimeout);
    speechSafetyTimeout = setTimeout(() => { if(window.isBusy) { window.isBusy = false; updateLottie('idle'); } }, 15000);

    window.speechSynthesis.speak(msg);
}

function stopAllSpeech() { 
    window.speechSynthesis.cancel(); 
    window.isBusy = false; 
    updateLottie('idle'); 
}

// --- 5. UI Helpers ---

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach((row) => {
        const qText = (window.currentLang === 'th') ? row[0] : row[1];
        if (qText) {
            const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.innerText = qText;
            btn.onclick = () => { activateSTT('manual'); getResponse(qText); }; // ให้ปุ่มกดแทรกได้
            container.appendChild(btn);
        }
    });
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
    const responseEl = document.getElementById('response-text');
    if (responseEl) responseEl.innerHTML = text.replace(/\n/g, '<br>'); 
}

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

async function initCamera() {
    try {
        video = document.getElementById('video'); 
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        if (video) { 
            video.srcObject = stream; 
            video.onloadedmetadata = () => { video.play(); loadFaceModels(); }; 
        }
    } catch (err) { console.error("❌ Camera Error"); }
}

// ผูกปุ่มไมค์ (Manual Override)
document.getElementById('micBtn').addEventListener('click', () => {
    activateSTT('manual');
});

document.addEventListener('DOMContentLoaded', initDatabase);
