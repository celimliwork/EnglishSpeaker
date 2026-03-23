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
