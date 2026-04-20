/**
 * 🤖 น้องนำทาง - THE ULTIMATE QUEUE & SEARCH VERSION
 * แก้ไข: ระบบคิวไม่ทับซ้อน, ข้อมูลกลับมาครบ, ระบบค้นหาแม่นยำ, ทักทายตามช่วงเวลา
 */

// --- 1. ระบบจัดการคิว (Task Queue System) ---
let taskQueue = [];
let isProcessingQueue = false;

function enqueueTask(taskFn, taskName = "Unknown Task") {
    taskQueue.push({ fn: taskFn, name: taskName });
    if (!isProcessingQueue) processNextTask();
}

async function processNextTask() {
    if (taskQueue.length === 0) { isProcessingQueue = false; return; }
    isProcessingQueue = true;
    const currentTask = taskQueue.shift();
    try { await currentTask.fn(); } catch (error) { console.error(`❌ Task Error:`, error); }
    processNextTask();
}

// --- 2. Constants & Global State ---
window.localDatabase = null;
window.currentLang = 'th'; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
let isAtHome = true; 
const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

let video; 
let recognition;
let wakeWordRecognition;
let manualMicOverride = false;
let personInFrameTime = null; 
let lastSeenTime = Date.now();
const DETECTION_INTERVAL = 200; 
let lastDetectionTime = 0;

// --- 3. ระบบเสียงและการพูด (Queue-Based) ---

function speak(text, isGreeting = false) {
    enqueueTask(() => {
        return new Promise((resolve) => {
            if (!text || window.isMuted) return resolve();
            forceStopAllMic(); 
            window.speechSynthesis.cancel();
            window.isBusy = true;
            updateLottie('talking');

            const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
            msg.lang = 'th-TH';
            msg.rate = 1.05;

            msg.onend = () => {
                window.isBusy = false;
                updateLottie('idle');
                if (isGreeting) { window.allowWakeWord = true; startWakeWord(); }
                else if (!isAtHome && !manualMicOverride) { setTimeout(() => { toggleListening(true); }, 800); }
                resolve();
            };
            msg.onerror = () => { window.isBusy = false; resolve(); };
            window.speechSynthesis.speak(msg);
        });
    }, "Speaking Task");
}

// --- 4. ระบบจัดการไมค์ (STT & Wake Word) ---

function forceStopAllMic() {
    if (recognition) try { recognition.abort(); } catch(e) {}
    if (wakeWordRecognition) try { wakeWordRecognition.abort(); } catch(e) {}
    if (window.micTimer) clearTimeout(window.micTimer);
    window.isListening = false;
}

function toggleListening(auto = false) {
    if (!auto) manualMicOverride = true;
    forceStopAllMic();
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

    setTimeout(() => {
        if (!recognition) initSpeechRecognition();
        try {
            document.getElementById('userInput').value = "";
            recognition.start();
            window.isListening = true;
        } catch (e) { console.error("Mic start failed", e); }
    }, 300);
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse("กำลังฟัง... พูดได้เลยครับ");
    };

    recognition.onresult = (e) => {
        if (window.micTimer) clearTimeout(window.micTimer);
        let interimText = "", finalText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            else interimText += e.results[i][0].transcript;
        }
        document.getElementById('userInput').value = finalText + interimText;

        window.micTimer = setTimeout(() => {
            const query = (finalText + interimText).trim();
            if (query) { forceStopAllMic(); getResponse(query); }
        }, 1800);
    };

    recognition.onend = () => {
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.remove('recording');
        window.isListening = false;
    };
}

// --- 5. ระบบทักทายและตรวจจับ (Face API) ---

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    isAtHome = false; 
    window.hasGreeted = true; 
    
    const now = new Date();
    const hour = now.getHours();
    let timeGreet = hour < 12 ? "สวัสดีตอนเช้าครับ" : hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ";
    const finalGreet = `${timeGreet} น้องนำทางยินดีให้บริการ วันนี้รับบริการด้านไหนดีครับ?`;
    
    displayResponse(finalGreet);
    speak(finalGreet, true); 
}

async function detectPerson() {
    if (typeof faceapi === 'undefined' || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_INTERVAL) { requestAnimationFrame(detectPerson); return; }
    lastDetectionTime = now;

    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
        if (predictions.length > 0) {
            if (personInFrameTime === null) personInFrameTime = now;
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) {
                greetUser();
            }
            lastSeenTime = now;
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
                personInFrameTime = null; resetToHome();
            }
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

// --- 6. ระบบค้นหาข้อมูล (Legacy Search Logic - ดึงกลับมาครบ) ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    updateInteractionTime();
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
    let bestMatch = { answer: "", score: 0 };

    for (const sheetName of Object.keys(window.localDatabase)) {
        if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
        window.localDatabase[sheetName].forEach(item => {
            const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
            if (!rawKeys) return;
            
            // แยก Key ด้วย , หรือ \n เหมือนเวอร์ชันก่อน
            const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim()).filter(k => k !== "");
            let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
            
            for (const key of keyList) {
                let score = 0;
                if (query === key) score = 10.0; // ตรงตัวเป๊ะ
                else {
                    let simScore = calculateSimilarity(query, key);
                    score = simScore * 5;
                }
                if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
            }
        });
    }

    if (bestMatch.score >= 0.45 && bestMatch.answer !== "") {
        displayResponse(bestMatch.answer);
        speak(bestMatch.answer);
    } else {
        const noData = "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาสอบถามเจ้าหน้าที่นะครับ";
        displayResponse(noData);
        speak(noData);
    }
}

// --- ฟังก์ชันเสริม (Similarity, UI, Initialization) ---

function calculateSimilarity(s1, s2) {
    let longer = s1.length < s2.length ? s2 : s1, shorter = s1.length < s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1, s2) {
    let costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else if (j > 0) {
                let newVal = costs[j - 1];
                if (s1.charAt(i - 1) != s2.charAt(j - 1)) newVal = Math.min(Math.min(newVal, lastValue), costs[j]) + 1;
                costs[j - 1] = lastValue; lastValue = newVal;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase || !window.localDatabase["FAQ"]) return;
    container.innerHTML = "";
    window.localDatabase["FAQ"].slice(1).forEach(row => {
        if (!row[0]) return;
        const btn = document.createElement('button');
        btn.className = 'faq-btn';
        btn.innerText = row[0];
        btn.onclick = () => { getResponse(row[0]); };
        container.appendChild(btn);
    });
}

function resetToHome() {
    isAtHome = true; window.hasGreeted = false; window.allowWakeWord = false;
    displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
    renderFAQButtons();
}

function updateInteractionTime() { lastSeenTime = Date.now(); }

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

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { 
            window.localDatabase = json.database; 
            document.getElementById('splash-screen').style.display = 'none';
            renderFAQButtons();
            initCamera();
        }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

async function initCamera() {
    video = document.getElementById('video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.play();
        requestAnimationFrame(detectPerson);
    } catch (e) { console.error("Camera failed"); }
}

document.addEventListener('DOMContentLoaded', initDatabase);
