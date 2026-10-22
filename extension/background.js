// extension/background.js
// Only this worker ever sees the Gemini key.
const DEFAULT_MODEL = "gemini-flash-latest"; // alias for the current flash model; override with "geminiModel" in chrome.storage.local

async function callGemini(prompt) {
  const { geminiKey, geminiModel } = await chrome.storage.local.get(["geminiKey", "geminiModel"]);
  if (!geminiKey) throw new Error("No Gemini key saved. Add it under AI settings.");

  const model = geminiModel || DEFAULT_MODEL;
  const ctrl = new AbortController();
 const timer = setTimeout(() => ctrl.abort(), 45000);

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: ctrl.signal,
      }
    );
    if (!r.ok) {
      throw new Error(`Gemini returned HTTP ${r.status}${r.status === 429 ? " (rate limit reached)" : ""}.`);
    }
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no text.");
    return text;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Gemini timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "parseTrip") return;

  // Only our own popup may use the key (not content scripts or other extensions).
  const fromPopup =
    sender.id === chrome.runtime.id &&
    !sender.tab &&
    typeof sender.url === "string" &&
    sender.url.startsWith(chrome.runtime.getURL("popup.html"));
  if (!fromPopup) {
    sendResponse({ ok: false, error: "Not allowed." });
    return;
  }
  if (typeof msg.prompt !== "string" || msg.prompt.length > 2000) {
    sendResponse({ ok: false, error: "Invalid request." });
    return;
  }

  callGemini(msg.prompt)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // keep the channel open for the async reply
});