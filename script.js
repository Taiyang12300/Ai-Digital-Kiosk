/**
 * 🚀 สมองกลน้องนำทาง - STATUS Control Version
 * ใช้ window.systemStatus เป็นตัวแปรเดียวในการคุมจังหวะการทำงาน
 */

// --- 1. Constants & Global State ---
const STATUS = {
    IDLE: 'IDLE',
    LISTENING: 'LISTENING',
    THINKING: 'THINKING',
    SPEAKING: 'SPEAKING'
};

window.systemStatus = STATUS.IDLE; // ตัวแปรคุมสถานะหลัก
window.localDatabase = null;
window.currentLang = 'th'; 
window.isMuted = false; 
window.hasGreeted = false;
window.allowWakeWord = false; 
let isAtHome = true; 

const GAS_URL = "https://script.google.com/macros/s/AKfycbz1bkIsQ588u-rpjY-8nMlya5_c0DsIabRvyPyCC_sPs5vyeJ_1wcOBaqKfg7cvlM3XJw/exec"; 

// ฟังก์ชันสำหรับเปลี่ยนสถานะ (ใช้ Log เพื่อ Debug จังหวะทำงานได้ง่ายขึ้น)
function setStatus(newStatus) {
    if (window.systemStatus === newStatus) return;
    console.log(`%c🔄 [SYSTEM STATE]: ${newStatus}`, "color: #00ebff; font-weight: bold; background: #222;");
    window.systemStatus = newStatus;
}

let lastFinalTranscript = "";
let recognition;
let wakeWordRecognition;
let isWakeWordActive = false;
let manualMicOverride = false;

// --- 2. Mic & Logic Control ---

function forceStopAllMic() {
    isWakeWordActive = false;
    if (recognition) { try { recognition.abort(); } catch(e) {} }
    if (wakeWordRecognition) { try { wakeWordRecognition.abort(); } catch(e) {} }
    if (window.micTimer) clearTimeout(window.micTimer);
}

function toggleListening() { 
    // ถ้ากำลังพูดอยู่ (SPEAKING) ให้หยุดพูดทันทีเพื่อรับคำสั่งใหม่
    if (window.systemStatus === STATUS.SPEAKING) {
        window.speechSynthesis.cancel();
        setStatus(STATUS.IDLE);
    }

    if (window.systemStatus === STATUS.LISTENING) { 
        forceStopAllMic();
        setStatus(STATUS.IDLE);
        return; 
    } 

    manualMicOverride = true;
    forceStopAllMic();

    setTimeout(() => {
        if (!recognition) initSpeechRecognition();
        try {
            lastFinalTranscript = "";
            document.getElementById('userInput').value = "";
            recognition.start(); 
        } catch (e) { 
            setStatus(STATUS.IDLE);
        }
    }, 250); 
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        setStatus(STATUS.LISTENING);
        document.getElementById('micBtn').classList.add('recording');
        displayResponse("กำลังฟัง... พูดได้เลยครับ");
    };

    recognition.onresult = (e) => {
        // 🔒 กันไมค์รับค่าถ้าสถานะไม่ได้อยู่ที่ LISTENING
        if (window.systemStatus !== STATUS.LISTENING) return;

        if (window.micTimer) clearTimeout(window.micTimer);
        let interimText = "";
        let finalText = "";

        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            else interimText += e.results[i][0].transcript;
        }

        if (finalText) lastFinalTranscript += finalText;
        const inputField = document.getElementById('userInput');
        if (inputField) inputField.value = lastFinalTranscript + interimText;

        window.micTimer = setTimeout(() => {
            // ป้องกันการส่งซ้ำซ้อน
            if (window.systemStatus !== STATUS.LISTENING) return;

            const finalQuery = (lastFinalTranscript + interimText).trim();
            if (finalQuery) {
                setStatus(STATUS.THINKING); 
                forceStopAllMic();
                getResponse(finalQuery);
            }
        }, 1800);
    };

    recognition.onend = () => {
        document.getElementById('micBtn').classList.remove('recording');
        // ถ้าจบการฟังปกติ ให้กลับไป IDLE เพื่อรอสถานะถัดไป
        if (window.systemStatus === STATUS.LISTENING) setStatus(STATUS.IDLE);
    };
}

// --- 3. Speech & Response ---

function speak(text, callback = null, isGreeting = false) {
    if (!text || window.isMuted) return;
    
    forceStopAllMic(); 
    window.speechSynthesis.cancel();
    
    // ตั้งสถานะเป็น SPEAKING ทันทีเพื่อล็อกไมค์ไม่ให้แทรก
    setStatus(STATUS.SPEAKING); 

    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '').replace(/[*#-]/g, ""));
    msg.lang = 'th-TH';
    msg.rate = 1.05;
    
    msg.onstart = () => { updateLottie('talking'); };
    
    msg.onend = () => { 
        updateLottie('idle'); 
        setStatus(STATUS.IDLE); // คืนค่าสถานะเป็นว่าง

        if (callback) callback();

        if (!isAtHome) {
            setTimeout(() => {
                // เช็คสถานะอีกครั้งเผื่อมีการคลิกปุ่มอื่นระหว่าง Delay
                if (window.systemStatus !== STATUS.IDLE) return;

                if (isGreeting) {
                    window.allowWakeWord = true;
                    startWakeWord(); 
                } else if (!manualMicOverride) {
                    toggleListening(); // เปิดไมค์รอคำถามต่อ
                }
            }, 1000); 
        }
    };
    window.speechSynthesis.speak(msg);
}

// --- 4. Wake Word Logic (ดักฟังชื่อ) ---

function setupWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    wakeWordRecognition = new SpeechRecognition();
    wakeWordRecognition.continuous = true; 
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (event) => {
        // 🔒 ทำงานเฉพาะตอน IDLE เท่านั้น
        if (window.systemStatus !== STATUS.IDLE) return;

        let transcript = event.results[event.results.length - 1][0].transcript;
        if (transcript.includes("น้องนำทาง") || transcript.includes("นำทาง")) {
            forceStopAllMic();
            speak("ครับผม มีอะไรให้น้องนำทางช่วยไหมครับ?");
        }
    };

    wakeWordRecognition.onend = () => {
        // วน Loop เฉพาะตอนที่ยังว่างและอยู่ในโหมดดักฟัง
        if (window.systemStatus === STATUS.IDLE && !isAtHome && isWakeWordActive) {
            try { wakeWordRecognition.start(); } catch(e) {}
        }
    };
}

function startWakeWord() {
    if (!window.allowWakeWord || isAtHome || window.systemStatus !== STATUS.IDLE) return;
    forceStopAllMic();
    setTimeout(() => {
        isWakeWordActive = true;
        try { wakeWordRecognition.start(); } catch(e) {}
    }, 300);
}

// --- ส่วนที่เหลือ (Database, UI, Face Detection) ใช้ฟังก์ชันเดิมทั้งหมด ---

async function getResponse(userQuery) {
    if (!userQuery || !window.localDatabase) { setStatus(STATUS.IDLE); return; }
    isAtHome = false; 
    updateLottie('thinking');
    
    // ... Logic การค้นหาเดิมของคุณ ...
    // เมื่อได้คำตอบแล้ว เรียก speak(answer);
}
