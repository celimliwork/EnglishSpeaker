/*
  Konuşma modülü: Web Speech API ile STT + TTS yönetir.
  STT interim sonuçları textarea'ya anlık aktarır.
  TTS için en uygun en-US sesi seçer, olayları dışarı bildirir.
*/
let recognition = null;
let isListening = false;
let currentUtterance = null;
let selectedVoice = null;

function pickBestVoice() {
  const voices = speechSynthesis.getVoices();
  selectedVoice =
    voices.find((v) => v.lang === "en-US" && /female|zira|samantha|aria/i.test(v.name)) ||
    voices.find((v) => v.lang === "en-US") ||
    voices[0] ||
    null;
}

export function initSpeech() {
  if ("speechSynthesis" in window) {
    pickBestVoice();
    speechSynthesis.onvoiceschanged = pickBestVoice;
  }
}

export function startSTT({ lang, onInterim, onFinal }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) throw new Error("Tarayıcın mikrofonu desteklemiyor, Chrome kullan");
  if (isListening) return;

  recognition = new SpeechRecognition();
  recognition.lang = lang || "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;
  isListening = true;

  recognition.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript;
      else interim += transcript;
    }
    if (interim) onInterim(interim.trim());
    if (finalText) onFinal(finalText.trim());
  };

  recognition.onend = () => {
    isListening = false;
    window.dispatchEvent(new CustomEvent("stt-ended"));
  };

  recognition.start();
}

export function stopSTT() {
  if (recognition && isListening) recognition.stop();
  isListening = false;
}

export function getIsListening() {
  return isListening;
}

export function speakText({ text, rate = 0.9, msgId }) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.rate = Number(rate) || 0.9;
  currentUtterance.lang = "en-US";
  if (selectedVoice) currentUtterance.voice = selectedVoice;

  currentUtterance.onstart = () => {
    window.dispatchEvent(new CustomEvent("tts-start", { detail: { msgId } }));
  };
  currentUtterance.onboundary = (e) => {
    window.dispatchEvent(new CustomEvent("tts-boundary", { detail: { msgId, charIndex: e.charIndex } }));
  };
  currentUtterance.onend = () => {
    window.dispatchEvent(new CustomEvent("tts-end", { detail: { msgId } }));
  };
  speechSynthesis.speak(currentUtterance);
}

export function pauseOrResumeTTS() {
  if (!("speechSynthesis" in window)) return;
  if (speechSynthesis.speaking && !speechSynthesis.paused) speechSynthesis.pause();
  else if (speechSynthesis.paused) speechSynthesis.resume();
}
