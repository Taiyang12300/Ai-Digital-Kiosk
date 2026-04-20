/**********************
 * 🔥 MIC CORE FIXED VERSION
 * - ไมค์นิ่ง ไม่ติดๆดับๆ
 * - WakeWord ทำงานตลอด
 * - ไม่แย่งกันระหว่าง STT กับ Wake
 **********************/

let wakeWordRecognition = null;
let recognition = null;

let isListening = false;
let isWakeWordActive = false;
let isBusy = false;

let micLock = false;          // 🔥 กัน start ซ้อน
let lastTranscript = "";
let silenceTimer = null;

/* =========================
   🔥 FORCE STOP MIC (นิ่งจริง)
========================= */
function forceStopAllMic() {
    try { if (recognition) recognition.abort(); } catch(e){}
    try { if (wakeWordRecognition) wakeWordRecognition.abort(); } catch(e){}

    isListening = false;
    isWakeWordActive = false;
    micLock = false;

    clearTimeout(silenceTimer);
}

/* =========================
   🎤 WAKE WORD (ฟังตลอด)
========================= */
function initWakeWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    wakeWordRecognition = new SR();
    wakeWordRecognition.continuous = true;
    wakeWordRecognition.interimResults = true;
    wakeWordRecognition.lang = 'th-TH';

    wakeWordRecognition.onresult = (e) => {
        if (isBusy || isListening) return;

        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            text += e.results[i][0].transcript;
        }

        if (text.includes("น้องนำทาง") || text.includes("นำทาง")) {
            console.log("🎯 Wake word detected");

            forceStopAllMic();

            setTimeout(() => {
                speak("มีอะไรให้ช่วยครับ");
            }, 300);
        }
    };

    wakeWordRecognition.onend = () => {
        // 🔥 restart แบบนิ่ง
        if (!isBusy && !isListening) {
            setTimeout(() => {
                try {
                    wakeWordRecognition.start();
                    isWakeWordActive = true;
                } catch(e){}
            }, 1200);
        }
    };

    wakeWordRecognition.start();
    isWakeWordActive = true;
}

/* =========================
   🎤 SPEECH TO TEXT (ถามจริง)
========================= */
function initSTT() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'th-TH';

    recognition.onstart = () => {
        isListening = true;
        micLock = true;
        lastTranscript = "";
        console.log("🎤 STT START");
    };

    recognition.onresult = (e) => {
        clearTimeout(silenceTimer);

        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
                final += e.results[i][0].transcript;
            }
        }

        if (final) {
            lastTranscript += final;
        }

        // 🔥 auto send
        silenceTimer = setTimeout(() => {
            if (!lastTranscript.trim()) return;

            let text = lastTranscript.trim();

            console.log("🚀 SEND:", text);

            forceStopAllMic();

            getResponse(text);

        }, 1500);
    };

    recognition.onend = () => {
        isListening = false;
        micLock = false;
    };
}

/* =========================
   🔥 TOGGLE MIC
========================= */
function startSTT() {
    if (micLock) return;

    forceStopAllMic();

    setTimeout(() => {
        try {
            recognition.start();
        } catch(e){}
    }, 300);
}

/* =========================
   🔊 SPEAK
========================= */
function speak(text) {
    if (!text) return;

    forceStopAllMic();
    isBusy = true;

    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'th-TH';

    msg.onend = () => {
        isBusy = false;

        // 🔥 กลับไปฟัง wake word
        setTimeout(() => {
            initWakeWord();
        }, 1000);
    };

    speechSynthesis.speak(msg);
}

/* =========================
   🚀 RESPONSE MOCK
========================= */
function getResponse(text) {
    console.log("ถาม:", text);

    setTimeout(() => {
        speak("กำลังตอบคำถาม: " + text);
    }, 500);
}

/* =========================
   🚀 START SYSTEM
========================= */
document.addEventListener("DOMContentLoaded", () => {
    initSTT();
    initWakeWord();
});
