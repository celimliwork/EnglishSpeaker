/*
  Ana orkestrasyon dosyası: state, event binding ve modüller arası akışı kurar.
  Kullanıcı mesajını alır, AI çağrısı yapar, sonucu render edip opsiyonel seslendirir.
  Kısayollar, ayarlar, sohbet yönetimi ve hata bildirimlerini burada yönetir.
*/
import { askAI, explainSelection } from "./api.js";
import { getIsListening, initSpeech, pauseOrResumeTTS, speakText, startSTT, stopSTT } from "./speech.js";
import {
  clearAllData,
  createChat,
  DEFAULT_SETTINGS,
  deleteChat,
  exportChat,
  getActiveChatId,
  getChats,
  getSettings,
  saveSettings,
  setActiveChatId,
  updateChat,
} from "./storage.js";
import { els, getSettingsFormValue, renderChats, renderMessages, renderModelOptions, renderSelectionModal, renderSettings, setMicVisual, setSpeakingBubble, toast } from "./ui.js";

let settings = getSettings();
let chats = getChats();
let activeChatId = getActiveChatId();
let shouldResumeListeningAfterTTS = false;
let sttBaseText = "";
let sttFinalText = "";

if (!chats.length) chats = [createChat("İlk Sohbet")];
if (!activeChatId || !chats.some((c) => c.id === activeChatId)) {
  activeChatId = chats[0].id;
  setActiveChatId(activeChatId);
}

function activeChat() {
  return chats.find((c) => c.id === activeChatId);
}

function refreshUI() {
  chats = getChats();
  renderChats(chats, activeChatId);
  renderMessages(activeChat()?.messages || [], settings);
}

function pushMessage(role, content, provider = settings.provider, model = provider === "gemini" ? settings.geminiModel : settings.openaiModel) {
  const id = crypto.randomUUID();
  const msg = { id, role, content, provider, model, createdAt: Date.now() };
  updateChat(activeChatId, (chat) => ({ messages: [...chat.messages, msg] }));
  return msg;
}

function cleanTextForSpeech(text = "") {
  return text
    .replace(/\[(Correction|Better sentence):[^\]]+\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildSystemPromptWithLevel() {
  const level = settings.englishLevel || "B1";
  const levelInstruction = `\n\nUser level: ${level}. Adapt vocabulary, grammar complexity, pace, and idioms to this CEFR level.
If the user makes sentence-level errors, add ONE short guidance at the end in this format: [Better sentence: "..."]`;
  return `${settings.systemPrompt}${levelInstruction}`;
}

function startListeningFlow() {
  sttBaseText = els.messageInput.value.trim();
  sttFinalText = "";
  startSTT({
    lang: settings.sttLang,
    onInterim: (t) => {
      const prefix = [sttBaseText, sttFinalText].filter(Boolean).join(" ").trim();
      els.messageInput.value = [prefix, t].filter(Boolean).join(" ").trim();
    },
    onFinal: (t) => {
      sttFinalText = [sttFinalText, t].filter(Boolean).join(" ").trim();
      els.messageInput.value = [sttBaseText, sttFinalText].filter(Boolean).join(" ").trim();
    },
  });
  setMicVisual(true);
}

function speakWithMicControl({ text, msgId }) {
  const speechText = cleanTextForSpeech(text);
  if (!speechText) return;
  if (getIsListening()) {
    shouldResumeListeningAfterTTS = true;
    stopSTT();
    setMicVisual(false);
  }
  speakText({ text: speechText, rate: settings.ttsSpeed, msgId });
}

async function sendCurrentInput() {
  const text = els.messageInput.value.trim();
  if (!text) return;

  const key = settings.provider === "gemini" ? settings.geminiKey : settings.openaiKey;
  if (!key) {
    toast("API key girilmedi", "warn");
    return;
  }

  stopSTT();
  setMicVisual(false);
  sttBaseText = "";
  sttFinalText = "";
  els.messageInput.value = "";
  pushMessage("user", text);
  refreshUI();

  try {
    const history = (activeChat()?.messages || [])
      .slice(-settings.historyLimit)
      .map((m) => ({ role: m.role === "ai" ? "assistant" : m.role, content: m.content }));

    const response = await askAI({
      provider: settings.provider,
      model: settings.provider === "gemini" ? settings.geminiModel : settings.openaiModel,
      apiKey: key,
      systemPrompt: buildSystemPromptWithLevel(),
      history,
      userText: text,
    });

    const aiMsg = pushMessage("ai", response);
    refreshUI();
    if (settings.autoRead) speakWithMicControl({ text: response, msgId: aiMsg.id });
  } catch (error) {
    toast(error.message || "Beklenmeyen bir hata oluştu", "error");
  }
}

function bindEvents() {
  els.sendBtn.addEventListener("click", sendCurrentInput);
  els.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentInput();
    }
  });

  els.micBtn.addEventListener("click", () => {
    if (getIsListening()) {
      stopSTT();
      setMicVisual(false);
      return;
    }
    try {
      startListeningFlow();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  window.addEventListener("stt-ended", () => {
    setMicVisual(false);
    sttBaseText = "";
    sttFinalText = "";
  });
  window.addEventListener("tts-start", (e) => setSpeakingBubble(e.detail.msgId, true));
  window.addEventListener("tts-end", () => {
    setSpeakingBubble("", false);
    if (!shouldResumeListeningAfterTTS) return;
    shouldResumeListeningAfterTTS = false;
    try {
      startListeningFlow();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  const openSelectionMeaning = (selectionText) => {
    const selected = selectionText.replace(/\s+/g, " ").trim();
    if (!selected || selected.length < 2) return;
    if (selected.split(" ").length > 8) {
      toast("Lutfen en fazla 8 kelimelik bir ifade sec", "warn");
      return;
    }
    const key = settings.provider === "gemini" ? settings.geminiKey : settings.openaiKey;
    els.wordModalTitle.textContent = selected;
    els.wordModalBody.textContent = "Yukleniyor...";
    els.wordModal.showModal();
    explainSelection({
      provider: settings.provider,
      model: settings.provider === "gemini" ? settings.geminiModel : settings.openaiModel,
      apiKey: key,
      selection: selected,
      englishLevel: settings.englishLevel || "B1",
    })
      .then((data) => renderSelectionModal(selected, data))
      .catch((error) => {
        els.wordModalBody.textContent = error.message || "Aciklama alinamadi";
      });
  };

  const handleSelectionLookup = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const selected = sel.toString();
    if (!selected) return;
    const anchorEl = sel.anchorNode?.parentElement;
    if (!anchorEl?.closest(".bubble.ai .content")) return;
    openSelectionMeaning(selected);
  };

  els.messages.addEventListener("mouseup", handleSelectionLookup);
  els.messages.addEventListener("touchend", () => setTimeout(handleSelectionLookup, 30));

  els.messages.addEventListener("click", (e) => {
    const speakBtn = e.target.closest(".speak-msg");
    const copyBtn = e.target.closest(".copy-msg");
    const wordToken = e.target.closest(".word-token");
    if (speakBtn) {
      const msg = activeChat()?.messages.find((m) => m.id === speakBtn.dataset.id);
      if (msg) speakWithMicControl({ text: msg.content, msgId: msg.id });
      return;
    }
    if (copyBtn) {
      const msg = activeChat()?.messages.find((m) => m.id === copyBtn.dataset.id);
      if (msg) {
        navigator.clipboard.writeText(msg.content);
        toast("Mesaj kopyalandı", "success");
      }
      return;
    }
    const activeSelection = window.getSelection();
    if (activeSelection && !activeSelection.isCollapsed && activeSelection.toString().trim()) {
      return;
    }
    if (wordToken) {
      const word = wordToken.dataset.word;
      if (!word) return;
      openSelectionMeaning(word);
      return;
    }
    const speakInlineBtn = e.target.closest(".speak-inline");
    if (speakInlineBtn) {
      const exampleText = speakInlineBtn.dataset.speakText || "";
      speakWithMicControl({ text: exampleText, msgId: "inline-example" });
    }
  });

  els.newChatBtn.addEventListener("click", () => {
    const chat = createChat("Yeni Sohbet");
    activeChatId = chat.id;
    setActiveChatId(chat.id);
    refreshUI();
  });

  els.chatList.addEventListener("click", (e) => {
    const item = e.target.closest(".chat-item");
    const del = e.target.closest(".delete-chat");
    if (del) {
      deleteChat(del.dataset.id);
      chats = getChats();
      activeChatId = getActiveChatId() || chats[0]?.id || "";
      if (!activeChatId && chats.length) {
        activeChatId = chats[0].id;
        setActiveChatId(activeChatId);
      }
      refreshUI();
      return;
    }
    if (item) {
      activeChatId = item.dataset.chatId;
      setActiveChatId(activeChatId);
      refreshUI();
      els.sidebar.classList.remove("open");
    }
  });

  els.chatList.addEventListener("blur", (e) => {
    const title = e.target.closest(".chat-title");
    if (!title) return;
    const chatId = title.closest(".chat-item")?.dataset.chatId;
    if (!chatId) return;
    updateChat(chatId, () => ({ title: title.textContent.trim() || "İsimsiz Sohbet" }));
    refreshUI();
  }, true);

  els.settingsBtn.addEventListener("click", () => els.settingsModal.showModal());
  els.closeSettingsBtn.addEventListener("click", () => els.settingsModal.close());
  els.closeWordModalBtn.addEventListener("click", () => els.wordModal.close());
  els.toggleSidebarBtn.addEventListener("click", () => els.sidebar.classList.toggle("open"));
  els.themeToggleBtn.addEventListener("click", () => {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    saveSettings(settings);
    renderSettings(settings);
  });

  els.aiProviderToggle.addEventListener("change", () => {
    settings.provider = els.aiProviderToggle.checked ? "openai" : "gemini";
    saveSettings(settings);
    renderSettings(settings);
  });

  document.querySelectorAll('input[name="provider"]').forEach((r) => {
    r.addEventListener("change", () => {
      settings.provider = r.value;
      saveSettings(settings);
      renderSettings(settings);
    });
  });

  els.toggleGeminiKey.addEventListener("click", () => {
    els.geminiKeyInput.type = els.geminiKeyInput.type === "password" ? "text" : "password";
  });
  els.toggleOpenaiKey.addEventListener("click", () => {
    els.openaiKeyInput.type = els.openaiKeyInput.type === "password" ? "text" : "password";
  });

  els.ttsSpeedRange.addEventListener("input", () => {
    els.ttsSpeedLabel.textContent = els.ttsSpeedRange.value;
    settings.ttsSpeed = Number(els.ttsSpeedRange.value);
  });
  els.ttsSpeedRange.addEventListener("change", () => {
    saveSettings(settings);
  });
  els.saveSettingsBtn.addEventListener("click", () => {
    settings = { ...settings, ...getSettingsFormValue() };
    saveSettings(settings);
    renderSettings(settings);
    els.settingsModal.close();
    toast("Ayarlar kaydedildi", "success");
  });

  els.exportChatBtn.addEventListener("click", () => {
    const text = exportChat(activeChatId);
    if (!text) return;
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chat-${activeChatId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  els.clearAllBtn.addEventListener("click", () => {
    clearAllData();
    settings = { ...DEFAULT_SETTINGS };
    saveSettings(settings);
    const chat = createChat("Yeni Sohbet");
    activeChatId = chat.id;
    setActiveChatId(activeChatId);
    renderSettings(settings);
    refreshUI();
    toast("Tüm veriler temizlendi", "success");
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.settingsModal.open) els.settingsModal.close();
    if (e.code === "Space" && document.activeElement !== els.messageInput) {
      e.preventDefault();
      els.micBtn.click();
    }
  });
}

function init() {
  initSpeech();
  renderModelOptions();
  renderSettings(settings);
  bindEvents();
  refreshUI();
}

init();

// Global quick control for pause/resume with double click on mic.
els.micBtn.addEventListener("dblclick", () => pauseOrResumeTTS());
