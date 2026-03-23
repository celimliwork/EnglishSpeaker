/*
  localStorage katmanı: ayarlar ve sohbetleri yönetir.
  Sohbetler ID bazlı tutulur, maksimum 50 kayıt saklanır.
  Bu modül diğer dosyalara sade CRUD fonksiyonları sağlar.
*/
const KEYS = {
  settings: "aes_settings_v1",
  chats: "aes_chats_v1",
  activeChatId: "aes_active_chat_id_v1",
};

export const DEFAULT_SYSTEM_PROMPT = `You are an American English conversation tutor for a Turkish speaker. Your role:

ALWAYS respond in English only
Keep responses SHORT (2-4 sentences max) — this is spoken conversation
If the user makes grammar mistakes, gently correct them ONCE at the end of your response in a bracket like: [Correction: "I goes" → "I go"]
If the user says something in Turkish, kindly ask them to try in English and give a hint
Focus on natural, everyday American English — slang, contractions, real expressions
Ask follow-up questions to keep conversation going
Adapt to the user's level: if they struggle, simplify; if they're confident, challenge them
Occasionally teach a useful American expression or idiom naturally in conversation`;

export const DEFAULT_SETTINGS = {
  provider: "gemini",
  geminiKey: "",
  openaiKey: "",
  geminiModel: "gemma-3-27b-it",
  openaiModel: "gpt-4o-mini",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  englishLevel: "B1",
  ttsSpeed: 0.9,
  autoRead: true,
  sttLang: "en-US",
  historyLimit: 20,
  theme: "dark",
};

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...parseJson(localStorage.getItem(KEYS.settings), {}) };
}

export function saveSettings(settings) {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

export function getChats() {
  return parseJson(localStorage.getItem(KEYS.chats), []);
}

export function saveChats(chats) {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
  localStorage.setItem(KEYS.chats, JSON.stringify(sorted));
}

export function createChat(title = "Yeni Sohbet") {
  const now = Date.now();
  const chat = { id: String(now), title, createdAt: now, updatedAt: now, messages: [] };
  const chats = getChats();
  chats.unshift(chat);
  saveChats(chats);
  setActiveChatId(chat.id);
  return chat;
}

export function updateChat(chatId, updater) {
  const chats = getChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx < 0) return null;
  const updated = { ...chats[idx], ...updater(chats[idx]), updatedAt: Date.now() };
  chats[idx] = updated;
  saveChats(chats);
  return updated;
}

export function deleteChat(chatId) {
  const chats = getChats().filter((c) => c.id !== chatId);
  saveChats(chats);
  if (getActiveChatId() === chatId) {
    setActiveChatId(chats[0]?.id || "");
  }
}

export function getActiveChatId() {
  return localStorage.getItem(KEYS.activeChatId) || "";
}

export function setActiveChatId(chatId) {
  localStorage.setItem(KEYS.activeChatId, chatId || "");
}

export function exportChat(chatId) {
  const chat = getChats().find((c) => c.id === chatId);
  return chat ? JSON.stringify(chat, null, 2) : "";
}

export function clearAllData() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}
