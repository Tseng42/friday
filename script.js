// ===== Friday — 前端聊天助手 =====
// 目前為假資料模擬版,尚未串接 Gemini API。

const STORAGE_KEY = "friday_gemini_api_key";

// 使用的模型(2026 年最新穩定版 Flash)
const MODEL = "gemini-3.6-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 對話上下文:保存整段對話,讓 Gemini 記得前面說過的內容
// 格式為 Gemini API 要求的 { role: "user" | "model", parts: [{ text }] }
const history = [];

// DOM 參照
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const apiKeyEl = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const settingsStatus = document.getElementById("settingsStatus");

// ===== 設定 / API 金鑰 =====
function loadApiKey() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

function openSettings() {
  apiKeyEl.value = loadApiKey();
  settingsStatus.classList.remove("show");
  settingsModal.classList.remove("hidden");
  apiKeyEl.focus();
}

function closeSettings() {
  settingsModal.classList.add("hidden");
}

function saveApiKey() {
  const key = apiKeyEl.value.trim();
  if (key) {
    localStorage.setItem(STORAGE_KEY, key);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  settingsStatus.textContent = "已儲存 ✓";
  settingsStatus.classList.add("show");
  setTimeout(closeSettings, 700);
}

settingsBtn.addEventListener("click", openSettings);
saveKeyBtn.addEventListener("click", saveApiKey);

// 點背景或關閉按鈕都能關閉對話框
settingsModal.querySelectorAll("[data-close]").forEach((el) =>
  el.addEventListener("click", closeSettings)
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) {
    closeSettings();
  }
});

// ===== 訊息顯示 =====
function addMessage(text, role) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ===== 送出訊息 =====
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  // 1. 先確認是否已設定金鑰;沒有就提示使用者,不呼叫 API
  const apiKey = loadApiKey();
  if (!apiKey) {
    addMessage(text, "user");
    inputEl.value = "";
    autoResize();
    addMessage("尚未設定 Gemini API 金鑰。請點右上角的齒輪圖示 ⚙️ 貼上你的金鑰後再試一次。", "assistant");
    return;
  }

  // 2. 顯示使用者訊息,並加入對話歷史
  addMessage(text, "user");
  history.push({ role: "user", parts: [{ text }] });
  inputEl.value = "";
  autoResize();

  // 3. 顯示「思考中...」暫時氣泡,並鎖住送出鈕避免重複送出
  const typing = addMessage("思考中", "assistant");
  typing.classList.add("typing");
  const stopDots = animateDots(typing);
  setSending(true);

  // 4. 呼叫 Gemini API
  try {
    const reply = await callGemini(apiKey);
    stopDots();
    typing.classList.remove("typing");
    typing.textContent = reply;
    history.push({ role: "model", parts: [{ text: reply }] });
  } catch (err) {
    stopDots();
    typing.classList.remove("typing");
    typing.classList.add("error");
    typing.textContent = "⚠️ " + err.message;
    // 呼叫失敗時,把剛剛加進歷史的使用者訊息移除,避免上下文錯亂
    history.pop();
  } finally {
    setSending(false);
    scrollToBottom();
  }
}

// 呼叫官方 Gemini REST endpoint:generateContent
async function callGemini(apiKey) {
  const url = `${API_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  console.log("[Friday] 呼叫模型:", MODEL, "| 對話輪數:", history.length);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: history }),
    });
  } catch (networkErr) {
    // fetch 本身失敗(斷網、CORS 被擋、DNS 等)
    console.error("[Friday] fetch 失敗(網路/CORS):", networkErr);
    throw new Error("無法連線到 Gemini,請檢查你的網路連線後再試一次。");
  }

  if (!res.ok) {
    // 讀出原始回應文字(可能是 JSON,也可能不是)
    const rawText = await res.text();
    let detail = "";
    try {
      const errBody = JSON.parse(rawText);
      detail = errBody?.error?.message || "";
    } catch (_) {
      detail = rawText;
    }
    // 把完整錯誤印到 Console,方便除錯
    console.error(
      "[Friday] Gemini API 錯誤\n狀態碼:",
      res.status,
      res.statusText,
      "\n原始回應:",
      rawText
    );
    const friendly = mapErrorMessage(res.status, detail);
    // 錯誤訊息同時帶上狀態碼與原始內容,方便截圖回報
    throw new Error(`${friendly}\n\n[除錯資訊] HTTP ${res.status}${detail ? "\n" + detail : ""}`);
  }

  const data = await res.json();
  console.log("[Friday] Gemini 原始回應:", data);

  // 內容被安全機制擋下時,candidates 可能為空
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error("這則訊息被 Gemini 的安全機制阻擋了,請換個說法再試。");
    }
    throw new Error("Gemini 沒有回傳任何內容,請再試一次。");
  }

  const reply = candidate.content?.parts?.map((p) => p.text).join("") || "";
  if (!reply.trim()) {
    throw new Error("Gemini 回傳了空白內容,請再試一次。");
  }
  return reply;
}

// 依 HTTP 狀態碼給出清楚的中文錯誤訊息
function mapErrorMessage(status, detail) {
  switch (status) {
    case 400:
      return "請求格式有誤,或 API 金鑰無效,請到設定確認金鑰是否正確。";
    case 401:
    case 403:
      return "API 金鑰無效或沒有權限,請到設定重新貼上正確的金鑰。";
    case 429:
      return "已超過免費額度或請求太頻繁,請稍後再試。";
    case 500:
    case 503:
      return "Gemini 伺服器目前忙碌或發生錯誤,請稍後再試。";
    default:
      return `發生錯誤(代碼 ${status})${detail ? ":" + detail : ""}`;
  }
}

// 讓「思考中」後面的點點動起來
function animateDots(el) {
  let n = 0;
  const timer = setInterval(() => {
    n = (n + 1) % 4;
    el.textContent = "思考中" + ".".repeat(n);
  }, 400);
  return () => clearInterval(timer);
}

// 送出中鎖定輸入,避免重複送出
function setSending(sending) {
  sendBtn.disabled = sending;
  inputEl.disabled = sending;
  if (!sending) inputEl.focus();
}

// ===== 輸入框行為 =====
function autoResize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}

inputEl.addEventListener("input", autoResize);

// Enter 送出;Shift+Enter 換行
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

// 初始化
autoResize();
inputEl.focus();
