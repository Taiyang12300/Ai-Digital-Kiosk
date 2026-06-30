/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (Fixed & Secured + Advanced Vision)
 * แก้ไข:
 * - [FIX-1] Flag Deadlock ใน startWakeWord()
 * - [FIX-2] speak() เปิดไมค์อัตโนมัติโดยไม่เช็ค context
 * - [FIX-3] initDatabase() retry ไม่มี limit
 * - [FIX-4] requestAnimationFrame loop สิ้นเปลือง CPU
 * - [FIX-5] Frontend รอยืนยัน deleted จาก backend ก่อน reset UI
 * - [FIX-6] ล้าง DOM ข้อมูลบัตรทันทีหลังยืนยัน
 * - [VISION-UPGRADE] อัปเกรดเป็น SsdMobilenetv1 + Landmarks เพื่อความนิ่ง
 * - [FUTURE-PROOF] เพิ่มตัวแปร window.detectedAge สำหรับเก็บอายุ (รอการนำไปใช้ในอนาคต)
 * - [TTS-UPGRADE] cleanTextForSpeech() + ปรับ rate/pitch ให้ Pattara ฟังธรรมชาติขึ้น
 * - [WALK-AWAY] หยุดอ่านและกลับหน้าโฮมเมื่อคนเดินออกจากกล้อง
 * - [FACE-MEMORY] จำใบหน้าชั่วคราวเพื่อไม่ทักทายซ้ำในวันเดียวกัน (จำกัด 50 คน)
 * - [WELCOME-BACK] ทักทายแบบคุ้นเคยเมื่อประชาชนคนเดิมเดินกลับมาหน้าตู้อีกครั้ง
 * - [GENDER-SAFEGUARD] ใช้ค่าความมั่นใจ (Confidence >= 95%) เพื่อป้องกันการทักเพศสภาพผิดพลาด
 */

window.localDatabase = null;
window.currentLang = 'th';
window.isMuted = false;
window.isBusy = false;
window.hasGreeted = false;
window.allowWakeWord = false;
window.isListening = false;
window.recognition = null;
window.isManualAborted = false;
window.currentAudio = null;

// ตัวแปรส่วนใบหน้า
window.detectedGender = 'male';
window.detectedGenderProbability = 0; // ตัวแปรเก็บค่าความมั่นใจของ AI
window.detectedAge = null;

// --- [FACE-MEMORY] ระบบจำใบหน้าชั่วคราว (เก็บใน RAM เท่านั้น ปิด browser ล้างหมด) ---
window.seenFaceDescriptors = []; // เก็บ descriptor ของคนที่เคยทักทายแล้ววันนี้
const FACE_MATCH_THRESHOLD = 0.45; // ค่าความใกล้เคียงของใบหน้า (ต่ำ = เข้มงวดกว่า)

let isAtHome = true;
const GAS_URL = "https://script.google.com/macros/s/AKfycbycksNLQnAvB6k0VKGoffG2imIfeYATcZRqztcKzYC274UpOVQtBmYnMI-SBAXiI_0deQ/exec";

let idleTimer = null;
let speechSafetyTimeout = null;
const IDLE_TIME_LIMIT = 5000;
let video;
let isDetecting = true;
let personInFrameTime = null;
let lastSeenTime = Date.now();

// [WALK-AWAY] ตัวแปรสำหรับตรวจจับคนเดินออก
let walkAwayTimer = null;
const WALK_AWAY_DELAY = 20000; // 20 วินาทีหลังไม่เจอหน้า → หยุดอ่าน

const DETECTION_INTERVAL = 500;

let wakeWordRecognition;
let isWakeWordActive = false;
let lastAskedQuestion = "";

const DB_MAX_RETRIES = 5;
let dbRetryCount = 0;

// --- [FACE-MEMORY] ฟังก์ชันคำนวณระยะห่างระหว่าง descriptor 2 ชุด ---
function euclideanDistance(desc1, desc2) {
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
        sum += Math.pow(desc1[i] - desc2[i], 2);
    }
    return Math.sqrt(sum);
}

function isAlreadySeen(descriptor) {
    if (!descriptor || window.seenFaceDescriptors.length === 0) return false;
    return window.seenFaceDescriptors.some(seen => {
        const dist = euclideanDistance(descriptor, seen);
        return dist < FACE_MATCH_THRESHOLD;
    });
}

function rememberFace(descriptor) {
    if (!descriptor) return;
    if (!isAlreadySeen(descriptor)) {
        // จำกัดการจำไว้ที่ 50 คน ถ้าเกินให้ลบคนแรกสุด (เก่าสุด) ทิ้งไป
        if (window.seenFaceDescriptors.length >= 50) {
            window.seenFaceDescriptors.shift(); 
        }
        
        window.seenFaceDescriptors.push(Array.from(descriptor));
        console.log(`🧠 [Face-Memory] จำใบหน้าใหม่ รวมทั้งหมด: ${window.seenFaceDescriptors.length}/50 คน`);
    }
}

// --- ระบบไมโครโฟน STT ---

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = true;
    window.recognition.interimResults = true;

    window.recognition.onstart = () => {
        window.isListening = true;
        updateMicUI(true);
    };

    window.recognition.onresult = (e) => {
        if (window.micTimer) clearTimeout(window.micTimer);

        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = e.resultIndex; i < e.results.length; ++i) {
            const text = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
                finalTranscript += text;
            } else {
                interimTranscript += text;
            }
        }

        const inputField = document.getElementById('userInput');
        if (inputField) inputField.value = finalTranscript || interimTranscript;

        if (finalTranscript.trim() !== "") {
            if (inputField) inputField.value = '';
            updateMicUI(false);
            processQuery(finalTranscript.trim());
            window.recognition.stop();
            return;
        }

        if (interimTranscript.trim() !== "") {
            window.micTimer = setTimeout(() => {
                const query = interimTranscript.trim();
                if (!query) return;
                if (inputField) inputField.value = '';
                updateMicUI(false);
                processQuery(query);
                window.recognition.stop();
            }, 1200);
        }
    };

    window.recognition.onend = () => {
        window.isListening = false;
        updateMicUI(false);
        if (window.isManualAborted || window.isBusy || window.isAudioPlaying) {
            console.log("🔇 [STT Mic] Stopped. WakeWord won't start — system busy.");
            return;
        }
        if (typeof startWakeWord === "function" && !isAtHome) {
            console.log("👂 [STT Mic] Ended. Switching back to WakeWord standby.");
            startWakeWord();
        }
    };

    window.recognition.onerror = (e) => {
        window.isListening = false;
        updateMicUI(false);
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'audio-capture') console.warn("ไม่พบไมโครโฟน หรือถูกปฏิเสธสิทธิ์");
        console.error("Mic Error:", e.error);
    };
}

function toggleListening() {
    window.speechSynthesis.cancel();
    if (window.currentAudio) {
        window.currentAudio.pause();
        window.currentAudio = null;
    }
    if (typeof forceStopAllMic === "function") forceStopAllMic();
    window.isManualAborted = false;
    if (window.micTimer) clearTimeout(window.micTimer);
    window.isBusy = false;
    window.isAudioPlaying = false;

    if (window.isListening) {
        updateLottie('idle');
        try { window.recognition.stop(); } catch(e) {}
    } else {
        updateLottie('thinking');
        setTimeout(() => {
            try {
                if (!window.isListening) {
                    window.recognition.start();
                    console.log("🎤 [Manual] User Triggered Mic");
                }
            } catch (e) {
                console.warn("Prevented Mic Overlap:", e.message);
                window.isListening = false;
                updateLottie('idle');
            }
        }, 300);
    }
}

function updateMicUI(isActive) {
    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');
    if (micBtn) micBtn.classList.toggle('recording', isActive);
    if (statusText) {
        if (isActive) {
            statusText.style.display = 'block';
            statusText.innerText = window.currentLang === 'th' ? "กำลังฟัง..." : "Listening...";
        } else {
            statusText.style.display = 'none';
        }
    }
}

function stopListening() {
    window.isListening = false;
    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');
    if (micBtn) micBtn.classList.remove('recording');
    if (statusText) statusText.innerText = (window.currentLang === 'th') ? "แตะไมค์เพื่อเริ่มพูด" : "Tap mic to speak";
}

// --- Splash Screen ---

function completeLoading() {
    const splash = document.getElementById('splash-screen');
    const progBar = document.getElementById('splash-progress-bar');
    const statusTxt = document.getElementById('splash-status-text');
    if (progBar) progBar.style.width = '100%';
    if (statusTxt) statusTxt.innerText = 'ระบบพร้อมใช้งานแล้ว';
    setTimeout(() => {
        if (splash) {
            splash.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
            splash.style.opacity = '0';
            splash.style.transform = 'scale(1.1)';
            splash.style.pointerEvents = 'none';
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
                initSpeechRecognition();
                console.log("🏠 [System] Home screen ready.");
            }, 800);
        }
    }, 600);
}

// --- ฟังก์ชันควบคุมเสียงกลาง ---

function forceStopAllMic() {
    window.isManualAborted = true;
    isWakeWordActive = false;
    window.isListening = false;
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) {}
    }
    if (window.recognition) {
        try { window.recognition.abort(); } catch(e) {}
    }
    updateMicUI(false);
    console.log("🛑 [System] All Microphones Released.");
}

function playAudioLink(url, callback = null) {
    if (!url) return;
    window.isBusy = true;
    window.isAudioPlaying = true;
    window.isManualAborted = true;
    stopAllSpeech();
    forceStopAllMic();
    if (window.micTimer) clearTimeout(window.micTimer);
    updateLottie('talking');
    if (window.currentAudio) {
        window.currentAudio.pause();
    }
    const audio = new Audio(url);
    window.currentAudio = audio;
    audio.onplay = () => {
        window.isBusy = true;
        window.isManualAborted = true;
        if (wakeWordRecognition) try { wakeWordRecognition.abort(); } catch(e) {}
    };
    audio.onended = () => {
        window.isAudioPlaying = false;
        window.currentAudio = null;
        setTimeout(() => {
            window.isBusy = false;
            window.isManualAborted = false;
            updateLottie('idle');
            updateInteractionTime();
            if (callback) {
                callback();
            } else if (window.allowWakeWord && window.hasGreeted) {
                startWakeWord();
            }
        }, 1000);
    };
    audio.onerror = () => {
        window.isAudioPlaying = false;
        window.isBusy = false;
        window.isManualAborted = false;
        updateLottie('idle');
    };
    audio.play().catch(e => {
        console.error("Audio Play Error:", e);
        window.isBusy = false;
        window.isAudioPlaying = false;
        window.isManualAborted = false;
    });
}

// --- Wake Word ---

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) {}
    }
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = true;
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        if (!window.allowWakeWord || window.isBusy || window.isListening || !window.hasGreeted) return;
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
        }
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            isWakeWordActive = false;
            forceStopAllMic();
            window.isBusy = true;
            let msg = "";
            if (window.currentLang === 'th') {
                const affirmations = ["ครับผม", "สวัสดีครับ", "น้องนำทางมาแล้วครับ"];
                const questions = ["มีอะไรให้ช่วยไหมครับ?", "สอบถามข้อมูลได้เลยนะครับ"];
                msg = `${affirmations[Math.floor(Math.random() * affirmations.length)]} ${questions[Math.floor(Math.random() * questions.length)]}`;
            } else {
                msg = "Yes! How can I help you?";
            }
            displayResponse(msg);
            setTimeout(() => {
                speak(msg, () => {
                    window.isBusy = false;
                    toggleListening();
                });
            }, 300);
        }
    };

    wakeWordRecognition.onend = () => {
        if (window.isManualAborted || window.isBusy || window.isAudioPlaying) {
            console.log("🔇 [WakeWord] Stay quiet. System is busy or manually aborted.");
            isWakeWordActive = false;
            return;
        }
        if (window.hasGreeted && personInFrameTime !== null && !window.isBusy && !window.isListening && isWakeWordActive) {
            setTimeout(() => {
                try {
                    if (!window.isBusy && !window.isListening && isWakeWordActive && !window.isManualAborted) {
                        wakeWordRecognition.start();
                    }
                } catch(e) {}
            }, 1500);
        } else {
            isWakeWordActive = false;
        }
    };

    wakeWordRecognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
            window.allowWakeWord = false;
            isWakeWordActive = false;
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || window.isListening || window.isMuted || window.isBusy || !window.hasGreeted) {
        isWakeWordActive = false;
        return;
    }

    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch(e) {}
    }
    if (window.recognition) {
        try { window.recognition.abort(); } catch(e) {}
    }
    window.isListening = false;
    updateMicUI(false);

    window.isManualAborted = false;

    setTimeout(() => {
        if (!window.isBusy && !window.isListening && window.allowWakeWord && !window.isManualAborted) {
            isWakeWordActive = true;
            try {
                wakeWordRecognition.start();
                console.log("👂 [WakeWord] Started Listening...");
            } catch(e) {
                console.error("WakeWord Start Error:", e);
            }
        }
    }, 200);
}

function stopWakeWord() {
    isWakeWordActive = false;
    if (wakeWordRecognition) {
        try { wakeWordRecognition.abort(); } catch (e) {}
    }
}

function updateInteractionTime() {
    lastSeenTime = Date.now();
    if (!isAtHome) restartIdleTimer();
}

document.addEventListener('mousedown', updateInteractionTime);
document.addEventListener('touchstart', updateInteractionTime);

async function logQuestionToSheet(userQuery) {
    if (!userQuery || !GAS_URL) return;
    try {
        const finalUrl = `${GAS_URL}?action=logOnly&query=${encodeURIComponent(userQuery)}`;
        await fetch(finalUrl, { mode: 'no-cors' });
    } catch (e) {}
}

function forceUnmute() {
    window.isMuted = false;
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.classList.remove('muted');
}

function resetToHome() {
    const now = Date.now();
    if (window.isBusy || personInFrameTime !== null || (now - lastSeenTime < IDLE_TIME_LIMIT)) {
        if (!isAtHome) restartIdleTimer();
        return;
    }
    if (isAtHome) return;
    stopAllSpeech();
    forceStopAllMic();
    forceUnmute();
    window.hasGreeted = false;
    window.allowWakeWord = false;
    window.isBusy = false;
    personInFrameTime = null;
    isAtHome = true;
    const fbContainer = document.getElementById('feedback-container');
    if (fbContainer) fbContainer.innerHTML = '';
    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons();
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function backToHomeKeepPerson() {
    forceStopAllMic();
    window.isBusy = false;
    isAtHome = true;
    const idCardPrintDiv = document.getElementById('id-card-copy-print');
    if (idCardPrintDiv) idCardPrintDiv.style.display = 'none';
    document.body.classList.remove('print-mode-idcard');
    const fbContainer = document.getElementById('feedback-container');
    if (fbContainer) fbContainer.innerHTML = '';
    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
    renderFAQButtons();
    updateLottie('idle');
    window.allowWakeWord = true;
    startWakeWord();
    console.log("🏠 [System] Back to Home (Keeping Person Context)");
}

function restartIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (!isAtHome) idleTimer = setTimeout(resetToHome, IDLE_TIME_LIMIT);
}

// --- ระบบดวงตา AI (Face-API) ---

async function loadFaceModels() {
    const MODEL_URL = 'https://taiyang12300.github.io/model/';
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL);
        // [FACE-MEMORY] โหลด faceRecognitionNet สำหรับจำใบหน้าชั่วคราว
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        setupWakeWord();
        setInterval(detectPerson, DETECTION_INTERVAL);
        console.log("✅ [FaceAPI] SsdMobilenetv1 + Landmarks + Age/Gender + Recognition loaded.");
    } catch (err) {
        console.error("❌ AI Model Load Failed", err);
    }
}

async function detectPerson() {
    if (!isDetecting || typeof faceapi === 'undefined' || !video) return;
    const now = Date.now();
    try {
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.55 });
        const predictions = await faceapi.detectAllFaces(video, options)
                                         .withFaceLandmarks()
                                         .withFaceDescriptors()
                                         .withAgeAndGender();

        const validFaces = predictions.filter(f => {
            const box = f.detection.box;
            return f.detection.score > 0.65 && box.width > 60;
        });

        if (validFaces.length > 0) {
            // [WALK-AWAY] มีคนอยู่ → ยกเลิก walk-away timer
            if (walkAwayTimer) {
                clearTimeout(walkAwayTimer);
                walkAwayTimer = null;
            }

            const face = validFaces.reduce((prev, current) =>
                (prev.detection.box.width > current.detection.box.width) ? prev : current
            );

            if (personInFrameTime === null) personInFrameTime = now;

            window.detectedGender = face.gender;
            window.detectedGenderProbability = face.genderProbability; // เก็บค่าความมั่นใจเพื่อใช้ทักทาย
            window.detectedAge = Math.round(face.age);

            // [FACE-MEMORY] เช็คว่าเคยทักทายคนนี้แล้วหรือยัง
            const descriptor = face.descriptor;
            const alreadySeen = isAlreadySeen(descriptor);

            if ((now - personInFrameTime) >= 1000 && isAtHome && !window.isBusy && !window.hasGreeted) {
                if (alreadySeen) {
                    // คนเดิมกลับมา → ทักทายแบบคุ้นเคย
                    console.log("🔁 [Face-Memory] คนเดิมกลับมา ทักทายแบบคุ้นเคย");
                    greetWelcomeBack(); 
                } else {
                    // คนใหม่ → ทักทายและจำใบหน้า
                    console.log(`👤 [Detected] เพศ: ${window.detectedGender} (มั่นใจ: ${(window.detectedGenderProbability * 100).toFixed(1)}%), อายุ: ${window.detectedAge} ปี`);
                    rememberFace(descriptor);
                    greetUser();
                }
            }
            lastSeenTime = now;
        } else {
            // [WALK-AWAY] ไม่เจอหน้า → เริ่มนับ walk-away timer
            if (personInFrameTime !== null && walkAwayTimer === null && !isAtHome) {
                walkAwayTimer = setTimeout(() => {
                    console.log("🚶 [Walk-Away] คนเดินออกไป → หยุดอ่านและกลับหน้าโฮม");
                    stopAllSpeech();
                    forceStopAllMic();
                    personInFrameTime = null;
                    window.hasGreeted = false;
                    window.allowWakeWord = false;
                    walkAwayTimer = null;
                    isAtHome = true;
                    const fbContainer = document.getElementById('feedback-container');
                    if (fbContainer) fbContainer.innerHTML = '';
                    displayResponse(window.currentLang === 'th' ? "กดปุ่มไมค์เพื่อสอบถามข้อมูลได้เลยครับ" : "Please tap the microphone.");
                    renderFAQButtons();
                    updateLottie('idle');
                    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
                }, WALK_AWAY_DELAY);
            }

            // reset เดิม กรณีออกไปนานเกิน 8 วินาที
            if (personInFrameTime !== null && (now - lastSeenTime > 8000)) {
                personInFrameTime = null;
                window.hasGreeted = false;
                window.allowWakeWord = false;
                forceStopAllMic();
                if (!isAtHome) restartIdleTimer();
            }
        }
    } catch (e) {}
}

function greetUser() {
    if (window.hasGreeted || window.isBusy) return;
    forceUnmute();
    isAtHome = false;
    window.hasGreeted = true;
    window.isBusy = true;
    const now = new Date();
    const hour = now.getHours();

    const gender = window.detectedGender || 'male';
    const confidence = window.detectedGenderProbability || 0; 
    let finalGreet = "";

    // ปรับเกณฑ์ความมั่นใจที่ 95% (0.95)
    const isConfident = confidence >= 0.95;

    if (window.currentLang === 'th') {
        let timeGreet = hour < 12 ? "สวัสดีตอนเช้าครับ" : hour === 12 ? "สวัสดีตอนเที่ยงครับ" : hour < 17 ? "สวัสดีตอนบ่ายครับ" : "สวัสดีตอนเย็นครับ";
        const ends = ["มีอะไรให้ช่วยไหมครับ?", "น้องนำทางยินดีให้บริการครับ", "วันนี้มาติดต่อเรื่องอะไรครับ?"];
        const endPhrase = ends[Math.floor(Math.random() * ends.length)];

        if (isConfident) {
            // มั่นใจสูง ทักทายระบุเพศเพื่อความว้าว
            const pType = (gender === 'male') ? "คุณผู้ชาย" : "คุณผู้หญิง";
            finalGreet = `${timeGreet} ${pType}... ${endPhrase}`;
        } else {
            // มั่นใจต่ำ ทักทายแบบกลางๆ ปลอดภัย
            finalGreet = `${timeGreet}... ${endPhrase}`;
        }
    } else {
        finalGreet = isConfident 
            ? `Hello ${gender === 'male' ? 'Sir' : 'Madam'}, how can I help you?` 
            : `Hello, how can I help you today?`;
    }

    displayResponse(finalGreet);
    speak(finalGreet, () => {
        window.isBusy = false;
        window.allowWakeWord = true;
    }, true);
}

// --- ฟังก์ชันสำหรับทักทายคนที่เคยคุยด้วยแล้วในวันนั้น ---
function greetWelcomeBack() {
    if (window.hasGreeted || window.isBusy) return;
    forceUnmute();
    isAtHome = false;
    window.hasGreeted = true;
    window.isBusy = true;

    const gender = window.detectedGender || 'male';
    const confidence = window.detectedGenderProbability || 0;
    let finalGreet = "";

    // ปรับเกณฑ์ความมั่นใจที่ 95% (0.95)
    const isConfident = confidence >= 0.95;

    if (window.currentLang === 'th') {
        // สุ่มคำทักทายสำหรับคนที่กลับมาหน้าตู้อีกครั้ง
        const phrases = [
            "การติดต่อธุระราบรื่นดีไหมครับ มีอะไรให้ผมช่วยเพิ่มเติมสอบถามได้เลยนะครับ",
            "ยังติดต่อธุระไม่เสร็จใช่ไหมครับ มีอะไรให้น้องนำทางช่วยเพิ่มเติมไหมครับ",
            "ขาดเหลือข้อมูลส่วนไหนหรือเปล่าครับ ให้ผมช่วยเหลือเพิ่มเติมได้นะครับ",
            "เจอกันอีกแล้วนะครับ ติดขัดขั้นตอนไหน สอบถามน้องนำทางได้เลยครับ"
        ];
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];

        if (isConfident) {
            const pType = (gender === 'male') ? "คุณผู้ชาย" : "คุณผู้หญิง";
            finalGreet = `${pType}... ${phrase}`;
        } else {
            // มั่นใจต่ำ ละการระบุเพศไว้
            finalGreet = `คุณครับ... ${phrase}`;
        }
    } else {
        finalGreet = `Welcome back! Do you need any further assistance?`;
    }

    displayResponse(finalGreet);
    speak(finalGreet, () => {
        window.isBusy = false;
        window.allowWakeWord = true;
    }, true);
}

// --- ระบบคัดกรองใบขับขี่ ---

function startLicenseCheck(type) {
    forceStopAllMic();
    isAtHome = false;
    const isThai = window.currentLang === 'th';
    if (type.includes("รถบรรทุก") || type.includes("สาธารณะ")) {
        selectLicenseExpiry(type, '3to3');
        return;
    }
    const msg = isThai ? `ใบขับขี่ ${type} เดิมของท่าน เป็นแบบไหนครับ?` : `What type is your current ${type} license?`;
    displayResponse(msg);
    speak(msg, () => { window.isBusy = false; });
    renderOptionButtons([
        { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", action: () => { forceStopAllMic(); selectLicenseExpiry(type + " (ชั่วคราว)", '2to5'); }, borderColor: "#a29bfe" },
        { th: "แบบบุคคล (5 ปี)", en: "Personal (5 years)", action: () => { forceStopAllMic(); selectLicenseExpiry(type + " (5 ปี)", '5to5'); }, borderColor: "#6c5ce7" }
    ]);
}

function selectLicenseExpiry(type, period) {
    const isThai = window.currentLang === 'th';
    const msg = isThai
        ? `ใบขับขี่ ${type} ของท่าน หมดอายุหรือยังครับ?`
        : `Has your ${type} license expired?`;
    displayResponse(msg);
    speak(msg, () => { window.isBusy = false; });
    renderOptionButtons([
        { th: "✅ ยังไม่หมดอายุ / ไม่เกิน 1 ปี", en: "Not expired / Under 1 year", action: () => { forceStopAllMic(); showLicenseChecklist(type, period, 'normal'); }, borderColor: "#28a745" },
        { th: "⚠️ หมดอายุเกิน 1 ปี (ไม่เกิน 3 ปี)", en: "Expired 1-3 years", action: () => { forceStopAllMic(); showLicenseChecklist(type, period, 'over1'); }, borderColor: "#ffc107" },
        { th: "❌ หมดอายุเกิน 3 ปี", en: "Expired over 3 years", action: () => { forceStopAllMic(); showLicenseChecklist(type, period, 'over3'); }, borderColor: "#dc3545" }
    ]);
}

function showLicenseChecklist(type, period, expiry) {
    const isThai = window.currentLang === 'th';
    let docs = ["บัตรประชาชน (ตัวจริง)", "ใบขับขี่เดิม", "ใบรับรองแพทย์ (ไม่เกิน 1 เดือน)"];
    let note = "";
    if (period === '3to3') {
        if (expiry === 'normal' || expiry === 'over1') {
            note = "อบรมออนไลน์ 2 ชม. และทดสอบสมรรถภาพร่างกาย + เช็คประวัติอาชญากรรม";
            docs.push("ผลผ่านการอบรมออนไลน์");
        } else if (expiry === 'over3') {
            note = "อบรมออนไลน์ 2 ชม. + ทดสอบสมรรถภาพ + สอบขับรถใหม่ + เช็คประวัติอาชญากรรม";
            docs.push("ผลผ่านการอบรมออนไลน์");
        }
    } else if (period === '2to5') {
        if (expiry === 'normal') note = "เปลี่ยนเป็น 5 ปี: ไม่ต้องอบรม ต่อได้ทันที";
        else if (expiry === 'over1') note = "ขาดเกิน 1 ปี: อบรมสำนักงาน 5 ชม. และสอบข้อเขียนใหม่";
        else if (expiry === 'over3') note = "ขาดเกิน 3 ปี: อบรมสำนักงาน 5 ชม. สอบข้อเขียนและสอบขับรถใหม่";
    } else if (period === '5to5') {
        if (expiry === 'normal') {
            docs.push("ผลผ่านการอบรมออนไลน์ (1 ชม.)");
            note = "ต่ออายุ 5 ปี: อบรมออนไลน์ DLT e-Learning 1 ชม.";
        } else if (expiry === 'over1') {
            docs.push("ผลผ่านการอบรมออนไลน์ (2 ชม.)");
            note = "ขาดเกิน 1 ปี: อบรมออนไลน์ 2 ชม. และต้องสอบข้อเขียนใหม่";
        } else if (expiry === 'over3') {
            note = "ขาดเกิน 3 ปี: ต้องอบรม 5 ชม. ที่ขนส่งเท่านั้น + สอบข้อเขียน + สอบขับรถ";
        }
    }
    let checklistHTML = "";
    docs.forEach((d, idx) => {
        checklistHTML += `<div class="check-item" onclick="document.getElementById('chk-${idx}').click()"><input type="checkbox" class="doc-check" id="chk-${idx}" onchange="checkChecklist()" onclick="event.stopPropagation()"><label>${d}</label></div>`;
    });
    const resultHTML = `
        <div class="checklist-card">
            <strong style="font-size:22px;">${type}</strong><br>
            <div style="background:#e8f0fe; color:#1a73e8; padding:12px; border-radius:8px; margin-top:10px; font-weight:bold;">💡 ${note}</div>
            <hr style="margin:15px 0; border:0; border-top:1px solid #eee;">
            ${checklistHTML}
            <button id="btnPrintGuide" style="display:none;" onclick="printLicenseNote('${type}', '${note}', '${docs.join('\\n')}'); setTimeout(() => { backToHomeKeepPerson(); }, 6000);">🖨️ ปริ้นใบนำทาง</button>
        </div>`;
    displayResponse(resultHTML);
    speak(isThai ? "กรุณาตรวจสอบเอกสารให้ครบถ้วน เพื่อพิมพ์ใบนำทางครับ" : "Please check all items to print your guide.");
}

function checkChecklist() {
    updateInteractionTime();
    const checks = document.querySelectorAll('.doc-check');
    const printBtn = document.getElementById('btnPrintGuide');
    if (!printBtn) return;
    const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
    if (allChecked) { printBtn.classList.add('show-btn'); printBtn.style.setProperty('display', 'block', 'important'); }
    else { printBtn.classList.remove('show-btn'); printBtn.style.setProperty('display', 'none', 'important'); }
}

// --- ระบบประมวลผลคำตอบ ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    lastAskedQuestion = userQuery;
    const fbContainer = document.getElementById('feedback-container');
    if (fbContainer) fbContainer.innerHTML = "";
    logQuestionToSheet(userQuery);
    if (window.isBusy) stopAllSpeech();
    isAtHome = false;
    updateInteractionTime();
    window.isBusy = true;
    updateLottie('thinking');
    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
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
    try {
        let bestMatch = { answer: "", score: 0, type: "" };
        let exactMatchFound = false;
        for (const sheetName of Object.keys(window.localDatabase)) {
            if (["Lottie_State", "Config", "FAQ"].includes(sheetName)) continue;
            for (const item of window.localDatabase[sheetName]) {
                const rawKeys = item[0] ? item[0].toString().toLowerCase() : "";
                if (!rawKeys) continue;
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim()).filter(k => k !== "");
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                for (const key of keyList) {
                    const lowerKey = key.toLowerCase();
                    if (query === lowerKey) {
                        bestMatch = { answer: ans, score: 100, type: "exact" };
                        exactMatchFound = true;
                        break;
                    }
                    if (!exactMatchFound && query.includes(lowerKey) && lowerKey.length > 2) {
                        let score = (lowerKey.length / query.length) * 10;
                        if (score > bestMatch.score) bestMatch = { answer: ans, score, type: "substring" };
                    }
                    if (!exactMatchFound) {
                        let simScore = calculateSimilarity(query, lowerKey) * 5;
                        if (simScore > bestMatch.score) bestMatch = { answer: ans, score: simScore, type: "similarity" };
                    }
                }
                if (exactMatchFound) break;
            }
            if (exactMatchFound) break;
        }

        const SUBSTRING_THRESHOLD = 2.0;
        const SIMILARITY_THRESHOLD = 3.5;
        const isGoodMatch = exactMatchFound ||
            (bestMatch.type === "substring" && bestMatch.score >= SUBSTRING_THRESHOLD) ||
            (bestMatch.type === "similarity" && bestMatch.score >= SIMILARITY_THRESHOLD);

        if (isGoodMatch && bestMatch.answer !== "") {
            displayResponse(bestMatch.answer);
            speak(bestMatch.answer);
            setTimeout(renderFeedbackButtons, 1000);
        } else {
            const noDataMsg = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ" : "No info found.";
            displayResponse(noDataMsg);
            speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000);
        }
    } catch (err) {
        window.isBusy = false;
        updateLottie('idle');
    }
}

async function processQuery(query) {
    window.speechSynthesis.cancel();
    const respBox = document.getElementById('response-text');
    if (respBox) respBox.innerText = (window.currentLang === 'th') ? "กำลังค้นหา..." : "Searching...";
    await getResponse(query);
    const inputField = document.getElementById('userInput');
    if (inputField) inputField.value = '';
}

// --- ระบบเสียง TTS (ปรับปรุงแล้ว) ---

function cleanTextForSpeech(text) {
    return text
        .replace(/<[^>]*>/gm, '')
        .replace(/[*#_]/g, '')
        .replace(/\-\-+/g, '')
        .replace(/(\d{1,2})\.(\d{2})\s*น\.?\s*[-–]\s*(\d{1,2})\.(\d{2})\s*น\.?/g, (match, h1, m1, h2, m2) => {
            const start = parseInt(m1) === 0 ? `เวลา ${parseInt(h1)} นาฬิกา` : `เวลา ${parseInt(h1)} นาฬิกา ${parseInt(m1)} นาที`;
            const end   = parseInt(m2) === 0 ? `เวลา ${parseInt(h2)} นาฬิกา` : `เวลา ${parseInt(h2)} นาฬิกา ${parseInt(m2)} นาที`;
            return `${start} ถึง ${end}`;
        })
        .replace(/(\d{1,2})\.00\s*น\.?/g, (match, h) => `เวลา ${parseInt(h)} นาฬิกา`)
        .replace(/(\d{1,2})\.(\d{2})\s*น\.?/g, (match, h, m) => `เวลา ${parseInt(h)} นาฬิกา ${parseInt(m)} นาที`)
        .replace(/(\d+)\s*-\s*(\d+)\s*(ปี|เดือน|วัน|ชั่วโมง|นาที)/g, '$1 ถึง $2 $3')
        .replace(/พ\.ร\.บ\./g, 'พระราชบัญญัติ')
        .replace(/ตรอ\./g, 'ตรอ')
        .replace(/ขส\.บ\.\d+/g, 'เอกสารขนส่ง')
        .replace(/DLT/gi, 'ดีแอลที')
        .replace(/Smart Queue/gi, 'สมาร์ทคิว')
        .replace(/e-Learning/gi, 'อีเลิร์นนิ่ง')
        .replace(/LPG|CNG|NGV/g, match => match.split('').join(' '))
        .replace(/(\d+)\s*ชม\./g, '$1 ชั่วโมง')
        .replace(/(\d+)\s*ชม\b/g, '$1 ชั่วโมง')
        .replace(/(\d+)\s*วันทำการ/g, '$1 วันทำการ')
        .replace(/(\d+)\s*ปี\b/g, '$1 ปี')
        .replace(/(\d+)\s*เดือน\b/g, '$1 เดือน')
        .replace(/รย\.(\d+)/g, 'รย $1')
        .replace(/บ\.(\d+)/g, 'บ $1')
        .replace(/ท\.(\d+)/g, 'ท $1')
        .replace(/(\d+)\.\s/g, '$1 ')
        .replace(/[()[\]]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
}

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;

    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
        console.warn("[TTS] Voices not loaded yet. Retrying in 100ms...");
        setTimeout(() => speak(text, callback, isGreeting), 100);
        return;
    }

    forceStopAllMic();
    window.speechSynthesis.cancel();
    window.isBusy = true;

    let cleanText = cleanTextForSpeech(text);

    const msg = new SpeechSynthesisUtterance(cleanText);
    const targetLang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    msg.lang = targetLang;

    let selectedVoice =
        voices.find(v => v.name.includes('Pattara'))                                                          ||
        voices.find(v => v.name.includes('Premwadee'))                                                        ||
        voices.find(v => v.name.includes('Niwat'))                                                            ||
        voices.find(v => (v.name.includes('Neural') || v.name.includes('Natural')) && v.lang === targetLang)  ||
        voices.find(v => v.lang === targetLang);

    if (selectedVoice) {
        msg.voice = selectedVoice;
        console.log(`%c[TTS] 🎙️ Voice: ${selectedVoice.name}`, "color: #00b894; font-weight: bold;");
    }

    msg.rate   = 0.88;
    msg.pitch  = 1.1;
    msg.volume = 1.0;

    msg.onstart = () => { updateLottie('talking'); };

    msg.onend = () => {
        window.isBusy = false;
        updateLottie('idle');
        if (callback) callback();
        setTimeout(() => {
            if (window.isBusy || window.isAudioPlaying) return;
            if (isGreeting) {
                window.allowWakeWord = true;
                startWakeWord();
            } else {
                if (!window.isListening && window.hasGreeted && !isAtHome) {
                    console.log("🎤 [Auto] Safe Opening Mic...");
                    toggleListening();
                    if (window.micTimer) clearTimeout(window.micTimer);
                    window.micTimer = setTimeout(() => {
                        if (window.isListening && !window.isBusy && !window.isAudioPlaying) {
                            forceStopAllMic();
                            window.allowWakeWord = true;
                            startWakeWord();
                        }
                    }, 6000);
                }
            }
        }, 1000);
    };

    msg.onerror = (e) => {
        console.error("TTS Error occurred:", e);
        window.isBusy = false;
        updateLottie('idle');
    };

    window.speechSynthesis.speak(msg);
}

function stopAllSpeech() {
    window.speechSynthesis.cancel();
    if (window.currentAudio) {
        try {
            window.currentAudio.pause();
            window.currentAudio.currentTime = 0;
        } catch (e) { console.warn("Audio stop error:", e); }
        window.currentAudio = null;
    }
    window.isBusy = false;
    window.isAudioPlaying = false;
    window.isManualAborted = false;
    updateLottie('idle');
    console.log("🤫 [System] All speech and audio stopped.");
}

// --- Render UI ---

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
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
        if (opt.borderColor) {
            btn.style.borderLeft = `10px solid ${opt.borderColor}`;
            btn.style.borderTop = "1px solid #ddd";
            btn.style.borderRight = "1px solid #ddd";
            btn.style.borderBottom = "1px solid #ddd";
            btn.style.textAlign = "left";
            btn.style.paddingLeft = "15px";
        } else {
            btn.style.border = "2px solid #6c5ce7";
        }
        btn.innerText = (window.currentLang === 'th' ? opt.th : opt.en);
        btn.onclick = () => {
            stopAllSpeech();
            window.isBusy = false;
            if (opt.action) opt.action();
            else if (opt.s_th) getResponse(window.currentLang === 'th' ? opt.s_th : opt.s_en);
        };
        container.appendChild(btn);
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
                costs[j - 1] = lastValue;
                lastValue = newVal;
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

// --- โหลด Database ---

async function initDatabase() {
    const progBar = document.getElementById('splash-progress-bar');
    const statusTxt = document.getElementById('splash-status-text');
    let currentWidth = 0;

    if (dbRetryCount >= DB_MAX_RETRIES) {
        console.error(`❌ [Database] โหลดล้มเหลวหลังจากลอง ${DB_MAX_RETRIES} ครั้ง`);
        if (statusTxt) statusTxt.innerText = '⚠️ โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ';
        if (progBar) { progBar.style.width = '100%'; progBar.style.background = '#e74c3c'; }
        return;
    }

    dbRetryCount++;

    const progressInterval = setInterval(() => {
        if (currentWidth < 90) {
            currentWidth += Math.random() * 3;
            if (progBar) progBar.style.width = currentWidth + '%';
        }
    }, 200);

    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) {
            window.localDatabase = json.database;
            dbRetryCount = 0;
            clearInterval(progressInterval);
            if (progBar) progBar.style.width = '100%';
            setTimeout(completeLoading, 600);
        } else {
            throw new Error("No database in response");
        }
    } catch (e) {
        clearInterval(progressInterval);
        console.error(`❌ [Database] Retry ${dbRetryCount}/${DB_MAX_RETRIES}...`);
        if (statusTxt) statusTxt.innerText = `⚠️ กำลังลองใหม่... (${dbRetryCount}/${DB_MAX_RETRIES})`;
        setTimeout(initDatabase, 3000);
    }
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

document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopAllSpeech(); forceStopAllMic(); }
});

window.addEventListener('beforeunload', () => { stopAllSpeech(); forceStopAllMic(); });

document.addEventListener('DOMContentLoaded', initDatabase);

if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {
        const voices = speechSynthesis.getVoices();
        console.log(`%c[System] 🎤 TTS Voices Loaded: ${voices.length} voices available.`, "color: #fdcb6e; font-weight: bold;");
        const thVoice = voices.find(v => v.lang === 'th-TH');
        if (thVoice) console.log(`%c[System] ✅ Thai Voice Ready: ${thVoice.name}`, "color: #00b894;");
    };
}

// --- Feedback ---

function renderFeedbackButtons() {
    const container = document.getElementById('feedback-container');
    if (!container) return;
    container.innerHTML = `
        <button class="feedback-btn btn-correct" onclick="submitFeedback('CORRECT')">✅ ถูกต้อง</button>
        <button class="feedback-btn btn-incorrect" onclick="submitFeedback('INCORRECT')">❌ ไม่ถูกต้อง</button>
    `;
}

async function submitFeedback(result) {
    const urlToCheck = `${GAS_URL}?action=feedback&query=${encodeURIComponent(lastAskedQuestion)}&result=${result}`;
    const container = document.getElementById('feedback-container');
    container.innerHTML = "กำลังส่ง...";
    try {
        await fetch(urlToCheck, { mode: 'no-cors' });
        container.innerHTML = "ขอบคุณที่ให้คำแนะนำครับ!";
    } catch (e) {
        console.error("ส่งพลาด:", e);
    }
}
