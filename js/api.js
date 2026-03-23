/*
  AI API katmanı: Gemini ve OpenAI için çağrıları yönetir.
  fetch + async/await + try/catch ile standart hata eşleme yapar.
  Ana modül bu dosyayı tek bir "askAI" fonksiyonu ile kullanır.
*/
function mapApiError(status) {
  if (status === 401) return "Geçersiz API key, Ayarlar'dan kontrol et";
  if (status === 429) return "Rate limit aşıldı, biraz bekle veya modeli değiştir";
  return "API isteği başarısız oldu";
}

export async function askAI({ provider, model, apiKey, systemPrompt, history, userText }) {
  try {
    if (!apiKey) {
      throw new Error("API key girilmedi");
    }
    if (provider === "gemini") {
      return await askGemini({ model, apiKey, systemPrompt, history, userText });
    }
    return await askOpenAI({ model, apiKey, systemPrompt, history, userText });
  } catch (error) {
    if (error.name === "TypeError") throw new Error("Bağlantı hatası, internet bağlantını kontrol et");
    throw error;
  }
}

export async function getWordDefinition(word) {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error("Kelime açıklaması alınamadı");
    const data = await response.json();
    const first = data?.[0];
    const phonetic = first?.phonetic || "";
    const meanings = (first?.meanings || [])
      .slice(0, 2)
      .map((m) => {
        const d = m.definitions?.[0];
        return {
          partOfSpeech: m.partOfSpeech || "",
          definition: d?.definition || "",
          example: d?.example || "",
        };
      })
      .filter((m) => m.definition);
    return { word, phonetic, meanings };
  } catch (error) {
    if (error.name === "TypeError") throw new Error("Bağlantı hatası, internet bağlantını kontrol et");
    throw error;
  }
}

export async function explainPhrase({ provider, model, apiKey, phrase, englishLevel = "B1" }) {
  if (!apiKey) throw new Error("Phrase açıklaması için önce API key gir");
  const prompt = [
    "Explain this English phrase for a Turkish learner.",
    `Learner level: ${englishLevel}`,
    `Phrase: "${phrase}"`,
    "Return concise Turkish output in this format:",
    "1) Kısa anlam",
    "2) Ne zaman kullanılır",
    "3) 2 örnek cümle (English + Turkish)",
  ].join("\n");

  if (provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });
    if (!response.ok) throw new Error(mapApiError(response.status));
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim();
    if (!text) throw new Error("Açıklama üretilemedi");
    return text;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });
  if (!response.ok) throw new Error(mapApiError(response.status));
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Açıklama üretilemedi");
  return text;
}

async function askGemini({ model, apiKey, systemPrompt, history, userText }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    ...history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: [{ text: userText }] },
  ];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });

  if (!response.ok) throw new Error(mapApiError(response.status));
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim();
  if (!text) throw new Error("AI yanıtı boş döndü");
  return text;
}

async function askOpenAI({ model, apiKey, systemPrompt, history, userText }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userText },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error(mapApiError(response.status));
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI yanıtı boş döndü");
  return text;
}
