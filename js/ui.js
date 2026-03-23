/*
  UI modülü: DOM render, toast, modal ve mesaj balonlarını yönetir.
  Sidebar ve ayarlar paneli etkileşimlerini sade yardımcılarla sunar.
  Markdown render ve correction vurgusu burada yapılır.
*/
const $ = (s) => document.querySelector(s);

export const els = {
  sidebar: $("#sidebar"),
  chatList: $("#chatList"),
  messages: $("#messages"),
  newChatBtn: $("#newChatBtn"),
  toggleSidebarBtn: $("#toggleSidebarBtn"),
  aiProviderToggle: $("#aiProviderToggle"),
  aiProviderLabel: $("#aiProviderLabel"),
  themeToggleBtn: $("#themeToggleBtn"),
  settingsBtn: $("#settingsBtn"),
  settingsModal: $("#settingsModal"),
  wordModal: $("#wordModal"),
  wordModalTitle: $("#wordModalTitle"),
  wordModalBody: $("#wordModalBody"),
  closeWordModalBtn: $("#closeWordModalBtn"),
  closeSettingsBtn: $("#closeSettingsBtn"),
  messageInput: $("#messageInput"),
  sendBtn: $("#sendBtn"),
  micBtn: $("#micBtn"),
  toastRoot: $("#toastRoot"),
  geminiKeyInput: $("#geminiKeyInput"),
  openaiKeyInput: $("#openaiKeyInput"),
  toggleGeminiKey: $("#toggleGeminiKey"),
  toggleOpenaiKey: $("#toggleOpenaiKey"),
  geminiModelSelect: $("#geminiModelSelect"),
  openaiModelSelect: $("#openaiModelSelect"),
  systemPromptInput: $("#systemPromptInput"),
  englishLevelSelect: $("#englishLevelSelect"),
  ttsSpeedRange: $("#ttsSpeedRange"),
  ttsSpeedLabel: $("#ttsSpeedLabel"),
  autoReadToggle: $("#autoReadToggle"),
  sttLangSelect: $("#sttLangSelect"),
  historyLimitSelect: $("#historyLimitSelect"),
  saveSettingsBtn: $("#saveSettingsBtn"),
  exportChatBtn: $("#exportChatBtn"),
  clearAllBtn: $("#clearAllBtn"),
};

const GEMINI_MODELS = ["gemma-3-27b-it", "gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-3.5-turbo", "gpt-4o"];

function humanProviderModel(provider, model) {
  const p = provider === "gemini" ? "Gemini" : "ChatGPT";
  return `${p} · ${model}`;
}

export function renderModelOptions() {
  els.geminiModelSelect.innerHTML = GEMINI_MODELS.map((m) => `<option value="${m}">${m}</option>`).join("");
  els.openaiModelSelect.innerHTML = OPENAI_MODELS.map((m) => `<option value="${m}">${m}</option>`).join("");
}

export function renderSettings(settings) {
  els.geminiKeyInput.value = settings.geminiKey;
  els.openaiKeyInput.value = settings.openaiKey;
  document.querySelector(`input[name="provider"][value="${settings.provider}"]`).checked = true;
  els.geminiModelSelect.value = settings.geminiModel;
  els.openaiModelSelect.value = settings.openaiModel;
  els.systemPromptInput.value = settings.systemPrompt;
  els.englishLevelSelect.value = settings.englishLevel || "B1";
  els.ttsSpeedRange.value = String(settings.ttsSpeed);
  els.ttsSpeedLabel.textContent = String(settings.ttsSpeed);
  els.autoReadToggle.checked = settings.autoRead;
  els.sttLangSelect.value = settings.sttLang;
  els.historyLimitSelect.value = String(settings.historyLimit);
  els.aiProviderToggle.checked = settings.provider === "openai";
  els.aiProviderLabel.textContent = settings.provider === "openai" ? "ChatGPT ⚪" : "Gemini 🟢";
  const geminiActive = settings.provider === "gemini";
  // Key alanları her zaman açık kalır; kullanıcı iki key'i de aynı anda saklayabilir.
  els.geminiKeyInput.disabled = false;
  els.openaiKeyInput.disabled = false;
  // Sadece aktif olmayan sağlayıcının model seçimi pasif kalır.
  els.geminiModelSelect.disabled = !geminiActive;
  els.openaiModelSelect.disabled = geminiActive;
  document.body.classList.toggle("light", settings.theme === "light");
}

export function getSettingsFormValue() {
  return {
    geminiKey: els.geminiKeyInput.value.trim(),
    openaiKey: els.openaiKeyInput.value.trim(),
    provider: document.querySelector('input[name="provider"]:checked')?.value || "gemini",
    geminiModel: els.geminiModelSelect.value,
    openaiModel: els.openaiModelSelect.value,
    systemPrompt: els.systemPromptInput.value.trim(),
    englishLevel: els.englishLevelSelect.value,
    ttsSpeed: Number(els.ttsSpeedRange.value),
    autoRead: els.autoReadToggle.checked,
    sttLang: els.sttLangSelect.value,
    historyLimit: Number(els.historyLimitSelect.value),
  };
}

function extractBracketTag(text = "", tag = "Correction") {
  const regex = new RegExp(`\\[${tag}:\\s*([^\\]]+)\\]`, "i");
  const match = text.match(regex);
  if (!match) return { cleaned: text, value: "" };
  return {
    cleaned: text.replace(match[0], "").replace(/\s{2,}/g, " ").trim(),
    value: match[1].trim(),
  };
}

function makeWordsClickable(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !parent.closest("code, pre, a, button")) targets.push(node);
    node = walker.nextNode();
  }

  targets.forEach((textNode) => {
    const text = textNode.textContent || "";
    if (!/[A-Za-z]/.test(text)) return;
    const fragment = document.createDocumentFragment();
    const parts = text.split(/([A-Za-z][A-Za-z'-]{1,})/g);
    parts.forEach((part) => {
      if (/^[A-Za-z][A-Za-z'-]{1,}$/.test(part)) {
        const token = document.createElement("button");
        token.type = "button";
        token.className = "word-token";
        token.dataset.word = part.toLowerCase();
        token.textContent = part;
        fragment.appendChild(token);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });
    textNode.replaceWith(fragment);
  });
}

export function renderMessages(messages, settings) {
  els.messages.innerHTML = messages
    .map((m) => {
      const meta = `${humanProviderModel(m.provider || settings.provider, m.model || (settings.provider === "gemini" ? settings.geminiModel : settings.openaiModel))} · ${new Date(m.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
      const correctionTag = extractBracketTag(m.content, "Correction");
      const betterSentenceTag = extractBracketTag(correctionTag.cleaned, "Better sentence");
      const main = betterSentenceTag.cleaned;
      const correction = correctionTag.value;
      const betterSentence = betterSentenceTag.value;
      return `
        <article class="bubble ${m.role === "user" ? "user" : "ai"}" data-msg-id="${m.id}">
          <div class="content">${window.marked.parse(main || "")}</div>
          ${correction ? `<div class="correction-card"><span>Correction</span>${correction}</div>` : ""}
          ${betterSentence ? `<div class="correction-card"><span>Try This</span>${betterSentence}</div>` : ""}
          <div class="meta">${meta}</div>
          <div class="actions">
            <button class="btn ghost speak-msg" data-id="${m.id}">🔊 Oku</button>
            <button class="btn ghost copy-msg" data-id="${m.id}">📋 Kopyala</button>
          </div>
        </article>
      `;
    })
    .join("");
  document.querySelectorAll(".bubble.ai .content").forEach((root) => makeWordsClickable(root));
  document.querySelectorAll("pre code").forEach((el) => window.hljs.highlightElement(el));
  els.messages.scrollTop = els.messages.scrollHeight;
}

export function renderChats(chats, activeId) {
  els.chatList.innerHTML = chats
    .map((c) => {
      const date = new Date(c.updatedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `
        <div class="chat-item ${c.id === activeId ? "active" : ""}" data-chat-id="${c.id}">
          <strong contenteditable="true" class="chat-title">${c.title}</strong>
          <small>${date}</small>
          <button class="btn ghost delete-chat" data-id="${c.id}">Sil</button>
        </div>
      `;
    })
    .join("");
}

export function toast(message, type = "warn") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  els.toastRoot.appendChild(node);
  setTimeout(() => node.remove(), 3000);
}

export function setMicVisual(active) {
  els.micBtn.classList.toggle("listening", active);
}

export function setSpeakingBubble(msgId, speaking) {
  document.querySelectorAll(".bubble.speaking").forEach((b) => b.classList.remove("speaking"));
  if (!speaking) return;
  const bubble = document.querySelector(`.bubble[data-msg-id="${msgId}"]`);
  if (bubble) bubble.classList.add("speaking");
}

export function renderWordModal(word, payload) {
  els.wordModalTitle.textContent = word;
  if (!payload?.meanings?.length) {
    els.wordModalBody.innerHTML = "<p>Anlam bulunamadı. Başka bir kelime deneyebilirsin.</p>";
    return;
  }
  const phonetic = payload.phonetic ? `<p><strong>Okunuş:</strong> ${payload.phonetic}</p>` : "";
  const meanings = payload.meanings
    .map(
      (m) => `
      <div class="word-meaning">
        <strong>${m.partOfSpeech || "meaning"}</strong>
        <p>${m.definition}</p>
        ${m.example ? `<small>Örnek: ${m.example}</small>` : ""}
      </div>
    `,
    )
    .join("");
  els.wordModalBody.innerHTML = `${phonetic}${meanings}`;
}

export function renderPhraseModal(title, explanationText) {
  els.wordModalTitle.textContent = title;
  els.wordModalBody.innerHTML = `<div class="word-meaning">${window.marked.parse(explanationText || "")}</div>`;
}
