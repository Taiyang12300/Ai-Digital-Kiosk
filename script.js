/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Interactive Workflow Fix)
 * แก้ไข: ลำดับการเปิด-ปิดไมค์ให้สัมพันธ์กับเสียงลำโพง (Prevention of Feedback Loop)
 * ปรับปรุง: ระบบกวาดล้างเสียงค้าง และปุ่มขัดจังหวะ (Manual Override)
 */

window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.isBusy = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
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
let micHardLock = false; // 🔥 กันระบบ restart ไมค์ซ้อนขณะมีเสียงลำโพง
let manualMicOverride = false; // 🔥 Priority สูงสุดสำหรับปุ่มกด
let isWakeWordActive = false;

// --- 🧹 ฟังก์ชันกวาดล้างระบบเสียง (Global Cleanup) ---
function globalAudioCleanup() {
    console.log("🧹 [Cleanup] Stopping all speech and audio...");
    window.speechSynthesis.cancel(); 
    
    // หยุดไฟล์เสียง MP3 ทั้งหมด
    const allAudios = document.querySelectorAll('audio');
    allAudios.forEach(a => { a.pause(); a.currentTime = 0; });

    if (window.micTimer) clearTimeout(window.micTimer);
    if (window.sttTimeout) clearTimeout(window.sttTimeout);
    
    forceStopAllMic();
}

function toggleListening() { 
    // 🚀 USER OVERRIDE - หยุดทุกอย่างทันทีเมื่อคนกดปุ่ม
    manualMicOverride = true;
    micHardLock = false; 
    globalAudioCleanup(); 

    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) { 
        try { window.recognition.stop(); } catch (e) {}
        stopListening();
        manualMicOverride = false; 
        return; 
    } 

    // เริ่มต้นฟังเสียงจากปุ่ม
    forceStopAllMic(); 
    setTimeout(() => {
        try {
            window.recognition.start(); 
            console.log("🎤 [Mic] Manual STT Started");
        } catch (e) { 
            window.isListening = false;
        }
    }, 300); 
}

function stopListening() { 
    window.isListening = false;
    manualMicOverride = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.remove('recording'); 
}

// --- 🚩 ฟังก์ชันจัดการ Splash Screen ---
function completeLoading() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.transition = 'opacity 0.8s ease';
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            isAtHome = true;
            window.isBusy = false;
            window.hasGreeted = false;
            window.allowWakeWord = false; 
            displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
            renderFAQButtons(); 
            initCamera();       
            initSpeechRecognition();
        }, 800);
    }
}

function forceStopAllMic() {
    isWakeWordActive = false;
    window.isListening = false; 

    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }

    // ถ้าไม่ได้กดด้วยมือ และระบบกำลังยุ่ง (พูดอยู่) ให้ Lock ไมค์ไว้
    if (manualMicOverride) {
        micHardLock = false;
    } else if (window.isBusy) {
        micHardLock = true;
    }
    console.log("🛑 [System] Mics Released (HardLock: " + micHardLock + ")");
}

function playAudioLink(url, callback = null) {
    if (!url) return;
    globalAudioCleanup(); // ล้างเสียงเก่าและปิดไมค์ก่อนเล่น MP3
    
    window.isBusy = true;
    updateLottie('talking');
    const audio = new Audio(url);

    audio.onended = () => {
        window.isBusy = false;
        updateLottie('idle');
        if (callback) callback();
        else if (!isAtHome) {
            // จบเสียง MP3 หน่วง 2 วิแล้วกลับไปดักฟังชื่อ
            setTimeout(startWakeWord, 2000);
        }
    };

    audio.onerror = () => { window.isBusy = false; updateLottie('idle'); };
    audio.play().catch(e => { window.isBusy = false; });
}

// --- 1. ระบบ Wake Word (น้องนำทาง) ---
function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.interimResults = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        if (window.isBusy || window.isListening) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }

        if (transcript.includes("น้องนำทาง") || transcript.includes("สวัสดีน้องนำทาง")) {
            console.log("🎯 [WakeWord] Matched!");
            forceStopAllMic();        
            window.isBusy = true;     

            const affirmations = ["ครับผม", "สวัสดีครับ", "น้องนำทางมาแล้วครับ"];
            const msg = affirmations[Math.floor(Math.random() * affirmations.length)] + " มีอะไรให้ช่วยไหมครับ?";
            
            displayResponse(msg);
            setTimeout(() => { speak(msg); }, 300); 
        }
    };

    wakeWordRecognition.onend = () => {
        if (manualMicOverride || micHardLock) return;

        if (!isAtHome && personInFrameTime !== null && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => {
                try { if (isWakeWordActive && !window.isBusy) wakeWordRecognition.start(); } catch(e) {}
            }, 1500); 
        }
    };
}

function startWakeWord() {
    if (manualMicOverride || isAtHome || window.isListening || window.isBusy) {
        isWakeWordActive = false;
        return;
    }
    try { 
        forceStopAllMic();
        setTimeout(() => {
            micHardLock = false;
            isWakeWordActive = true; 
            wakeWordRecognition.start(); 
            console.log("🎤 [System] WakeWord Stand-by");
        }, 500);
    } catch (e) {}
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = 'th-TH';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;

    window.recognition.onstart = () => {
        window.isListening = true;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
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
                    forceStopAllMic();
                    if (inputField) inputField.value = ""; 
                    getResponse(finalQuery); 
                }
            }, 2500); 
        }
    };

    window.recognition.onend = () => { stopListening(); };
}

// --- 2. ระบบดวงตา AI ---
async function detectPerson() {
    if (!isDetecting || !video) { requestAnimationFrame(detectPerson); return; }
    const now = Date.now();
    try {
        const predictions = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
        if (predictions.length > 0) {
            if (personInFrameTime === null) personInFrameTime = now;
            if ((now - personInFrameTime) >= 2000 && isAtHome && !window.isBusy && !window.hasGreeted) { greetUser(); }
            lastSeenTime = now; 
        } else {
            if (personInFrameTime !== null && (now - lastSeenTime > 5000)) {
                resetToHome();
            }
        }
    } catch (e) {}
    requestAnimationFrame(detectPerson);
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    isAtHome = false; 
    window.hasGreeted = true; 
    window.isBusy = true; 

    let finalGreet = "สวัสดีครับ น้องนำทางยินดีให้บริการครับ มีอะไรให้ช่วยไหมครับ?";
    displayResponse(finalGreet);
    speak(finalGreet, () => { 
        window.isBusy = false; 
        window.allowWakeWord = true; 
        startWakeWord();
    }); 
}

// --- 3. ระบบปริ้นใบนำทาง ---
function printLicenseNote(type, note, docs) {
    // 🔥 ปิดไมค์ทันทีเมื่อเริ่มกระบวนการปริ้น
    forceStopAllMic();
    const printSoundUrl = "YOUR_MP3_URL_HERE.mp3"; 
    playAudioLink(printSoundUrl, () => {
        resetToHome(); 
    });
}

// --- 4. ระบบประมวลผลคำตอบ ---
async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    globalAudioCleanup(); // ล้างเสียงค้างก่อนแสดงคำตอบใหม่
    isAtHome = false; 
    window.isBusy = true;
    updateLottie('thinking');

    // ... (โลจิกค้นหาใน Database ของคุณ) ...
    // ตัวอย่างการส่งคำตอบ:
    // displayResponse(answer);
    // speak(answer);
}

// --- 5. ระบบเสียง (TTS) ---
function speak(text, callback = null) {
    if (!text || window.isMuted) return;
    
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    window.isBusy = true; 

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'th-TH';
    msg.onstart = () => { updateLottie('talking'); };
    
    msg.onend = () => { 
        window.isBusy = false; 
        updateLottie('idle'); 
        if (callback) callback();

        if (!isAtHome) {
            // 🔥 หัวใจสำคัญ: หน่วงเวลา 2 วิเพื่อให้ Hardware เสียงเงียบสนิทก่อนเปิดไมค์
            setTimeout(() => {
                if (window.isBusy || manualMicOverride) return;

                // ถ้าไม่ได้อยู่ในโหมดทักทาย ให้เปิดไมค์รอรับคำถาม (STT) 6 วินาที
                console.log("🎤 [System] Auto-Opening Mic for Question...");
                toggleListening(); 

                if (window.sttTimeout) clearTimeout(window.sttTimeout);
                window.sttTimeout = setTimeout(() => {
                    if (window.isListening && !window.isBusy && !manualMicOverride) {
                        console.log("⏰ STT Timeout: Switching to WakeWord Mode");
                        forceStopAllMic(); 
                        startWakeWord(); 
                    }
                }, 6000); 
            }, 2000); 
        }
    };
    window.speechSynthesis.speak(msg);
}

function resetToHome() {
    globalAudioCleanup();
    isAtHome = true; 
    window.hasGreeted = false;
    window.allowWakeWord = false; 
    window.isBusy = false; 
    personInFrameTime = null;       
    displayResponse("กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ");
    renderFAQButtons(); 
}

// --- การเริ่มต้นระบบ ---
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
    video = document.getElementById('video'); 
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = stream; 
        video.onloadedmetadata = () => { video.play(); loadFaceModels(); };
    } catch (err) { console.error("Camera Error"); }
}

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    setupWakeWord(); 
    requestAnimationFrame(detectPerson);
}

document.addEventListener('DOMContentLoaded', initDatabase);
