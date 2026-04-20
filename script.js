/**
 * 🚀 สมองกลน้องนำทาง - Ultimate Hybrid Version (No-Interim Logic)
 * แก้ไข: ตัดการแสดงผลระหว่างพูดเพื่อป้องกันข้อความซ้ำ (Double Text)
 * ปรับปรุง: ย้ายตัวแปร Global เพื่อเสถียรภาพของระบบค้นหาและปุ่ม FAQ
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
let micHardLock = false; 
let manualMicOverride = false; 
let isWakeWordActive = false;
let lastFinalTranscript = ""; 

// ✅ ย้ายมาไว้ด้านบนสุดเพื่อให้ทุกฟังก์ชันเข้าถึงได้
let isSubmitting = false; 

// --- ฟังก์ชันจัดการไมโครโฟน ---

function toggleListening() { 
    manualMicOverride = true;
    micHardLock = false; 
    window.speechSynthesis.cancel(); 
    if (window.micTimer) clearTimeout(window.micTimer);
    
    if (!window.recognition) initSpeechRecognition();

    if (window.isListening) { 
        try { window.recognition.stop(); } catch (e) {}
        window.isListening = false;
        manualMicOverride = false; 
        return; 
    } 

    forceStopAllMic(); 
    setTimeout(() => {
        try {
            micHardLock = false;
            window.recognition.start(); 
        } catch (e) { 
            window.isListening = false;
        }
    }, 200); 
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    window.recognition = new SpeechRecognition();
    window.recognition.lang = window.currentLang === 'th' ? 'th-TH' : 'en-US';
    window.recognition.continuous = true;
    // ✅ ปิดการแสดงผลระหว่างทางเพื่อกันข้อความเบิ้ล
    window.recognition.interimResults = false; 

    window.recognition.onstart = () => {
        window.isListening = true;
        isSubmitting = false;
        lastFinalTranscript = ""; 
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.add('recording');
        displayResponse(window.currentLang === 'th' ? "กำลังฟัง... พูดได้เลยครับ" : "Listening...");
    };

    window.recognition.onresult = (e) => {
        if (isSubmitting) return;
        if (window.micTimer) clearTimeout(window.micTimer);
        
        let newText = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            if (e.results[i].isFinal) {
                newText += e.results[i][0].transcript;
            }
        }

        lastFinalTranscript += newText;

        // 🚀 ส่งอัตโนมัติเมื่อหยุดพูด 2 วินาที
        window.micTimer = setTimeout(() => {
            const finalQuery = lastFinalTranscript.trim();
            
            if (finalQuery !== "" && !isSubmitting) {
                isSubmitting = true;
                
                // แสดงข้อความในช่องพิมพ์แค่ครั้งเดียวตอนจะส่ง
                const inputField = document.getElementById('userInput');
                if (inputField) inputField.value = finalQuery;

                console.log("🚀 [Auto-Submit] Sending:", finalQuery);
                try { window.recognition.stop(); } catch(err) {} 
                
                // ล้างค่ารอรอบใหม่
                lastFinalTranscript = ""; 
                getResponse(finalQuery); 
            }
        }, 2000); 
    };

    window.recognition.onend = () => {
        window.isListening = false;
        const micBtn = document.getElementById('micBtn');
        if (micBtn) micBtn.classList.remove('recording');
        setTimeout(() => { isSubmitting = false; }, 500);
    };
}

// --- ฟังก์ชันค้นหาและประมวลผล ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) return;
    
    // เคลียร์ช่องพิมพ์และตัวแปรสะสมทันทีที่เริ่มค้นหา
    const inputField = document.getElementById('userInput');
    if (inputField) inputField.value = ""; 
    lastFinalTranscript = "";

    if (window.isBusy) stopAllSpeech();
    isAtHome = false; 
    updateInteractionTime(); 
    window.isBusy = true;
    updateLottie('thinking');

    const query = userQuery.toLowerCase().trim().replace(/[?？!！]/g, "");
    
    // Logic พิเศษสำหรับใบขับขี่
    const isLicense = query.includes("ใบขับขี่") || query.includes("license");
    const isRenew = query.includes("ต่อ") || query.includes("renew");
    if (isLicense && isRenew && !query.includes("ชั่วคราว") && !query.includes("5 ปี")) {
        forceStopAllMic(); 
        const askMsg = (window.currentLang === 'th') ? "ใบขับขี่ของท่านเป็นแบบชั่วคราว หรือแบบ 5 ปีครับ?" : "Is it Temporary or 5-year?";
        displayResponse(askMsg); 
        speak(askMsg, () => { window.isBusy = false; });
        renderOptionButtons([
            { th: "แบบชั่วคราว (2 ปี)", en: "Temporary (2 years)", action: () => { forceStopAllMic(); startLicenseCheck("แบบชั่วคราว (2 ปี)"); } },
            { th: "แบบ 5 ปี", en: "5-year type", action: () => { forceStopAllMic(); startLicenseCheck("แบบ 5 ปี"); } }
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
                const keyList = rawKeys.split(/[,|\n]/).map(k => k.trim()).filter(k => k !== "");
                let ans = window.currentLang === 'th' ? (item[1] || "") : (item[2] || item[1]);
                for (const key of keyList) {
                    let score = 0;
                    if (query === key) score = 10.0;
                    else { score = calculateSimilarity(query, key) * 5; }
                    if (score > bestMatch.score) bestMatch = { answer: ans, score: score };
                }
            });
        }
        if (bestMatch.score >= 0.45 && bestMatch.answer !== "") { 
            displayResponse(bestMatch.answer); 
            speak(bestMatch.answer); 
        } else { 
            const noDataMsg = window.currentLang === 'th' ? "ขออภัยครับ น้องหาข้อมูลไม่พบ กรุณาติดต่อเจ้าหน้าที่นะครับ" : "No info found.";
            displayResponse(noDataMsg); 
            speak(noDataMsg);
            setTimeout(renderFAQButtons, 3000); 
        }
    } catch (err) { window.isBusy = false; }
}

// --- ฟังก์ชันอื่นๆ คงเดิมตามโครงสร้างของคุณ ---

function stopListening() { 
    window.isListening = false;
    manualMicOverride = false;
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.remove('recording'); 
}

function forceStopAllMic() {
    isWakeWordActive = false;
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.recognition) { try { window.recognition.abort(); } catch(e) {} }
    if (manualMicOverride) { micHardLock = false; } else if (window.isBusy) { micHardLock = true; }
}

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
        if (!isAtHome && !manualMicOverride) {
            setTimeout(() => { if (!window.isBusy) toggleListening(); }, 2000);
        }
    };
    window.speechSynthesis.speak(msg);
}

function renderFAQButtons() {
    const container = document.getElementById('faq-container');
    if (!container || !window.localDatabase) return;
    container.innerHTML = "";
    if (window.localDatabase["FAQ"]) {
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
}

// (ฟังก์ชันเสริม calculateSimilarity, updateLottie, etc. ใส่ต่อท้ายได้เลยครับ)
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

function displayResponse(text) { const responseEl = document.getElementById('response-text'); if (responseEl) responseEl.innerHTML = text.replace(/\n/g, '<br>'); }

function stopAllSpeech() { window.speechSynthesis.cancel(); window.isBusy = false; updateLottie('idle'); }

function updateInteractionTime() { lastSeenTime = Date.now(); }

async function initDatabase() {
    try {
        const res = await fetch(GAS_URL);
        const json = await res.json();
        if (json.database) { window.localDatabase = json.database; completeLoading(); }
    } catch (e) { setTimeout(initDatabase, 3000); }
}

function renderOptionButtons(options) {
    const container = document.getElementById('faq-container');
    if (!container) return; container.innerHTML = "";
    options.forEach(opt => {
        const btn = document.createElement('button'); btn.className = 'faq-btn'; btn.style.border = "2px solid #6c5ce7";
        btn.innerText = (window.currentLang === 'th' ? opt.th : opt.en);
        btn.onclick = () => { stopAllSpeech(); window.isBusy = false; if (opt.action) opt.action(); };
        container.appendChild(btn);
    });
}

// (ส่วนอื่นๆ เช่น initCamera, detectPerson ใส่กลับเข้าไปได้ตามปกติครับ)

document.addEventListener('DOMContentLoaded', initDatabase);
