// ===== Friday — 前端聊天助手 =====
// 目前為假資料模擬版,尚未串接 Gemini API。

const STORAGE_KEY = "friday_gemini_api_key";

// 使用的模型(2026 年最新穩定版 Flash)
const MODEL = "gemini-3.6-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Friday 的人格設定:隨每次請求以 systemInstruction 帶給 Gemini
const SYSTEM_INSTRUCTION = `你是 Friday,一位智慧助理,個性設定參考東尼史塔克的 AI 管家:沉穩、自信、精簡,帶一點乾式幽默感。

回答原則:
- 直接給重點,不說開場白或客套話,不重複使用者的問題。
- 篇幅盡量精簡;只有在使用者要求細節、或主題本身需要步驟/清單時才展開。
- 除了回答問題本身,如果你判斷使用者可能還沒問到但顯然該注意的事(風險、前提、下一步),主動簡短補一句,不要長篇大論。
- 語氣自信、略帶幽默,但不油腔滑調,不用「親愛的使用者」「很高興為您服務」這類制式客服語言。
- 使用繁體中文回答,除非使用者用其他語言發問。`;

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

const micBtn = document.getElementById("micBtn");
const voiceToggleBtn = document.getElementById("voiceToggleBtn");

const appEl = document.getElementById("app");
const hudStatusEl = document.getElementById("hudStatus");

// HUD 狀態:idle(待命)/ listening(聆聽中)/ speaking(朗讀中),純視覺呈現語音互動階段
const HUD_LABELS = { idle: "待命中", listening: "聆聽中…", speaking: "回覆中…" };
function setHudState(state) {
  appEl.dataset.state = state;
  hudStatusEl.textContent = HUD_LABELS[state] || HUD_LABELS.idle;
}

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
function formatTime(d) {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function addMessage(text, role) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = formatTime(new Date());

  wrap.appendChild(bubble);
  wrap.appendChild(time);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ===== 輕量 Markdown 轉換(只用於助手回覆)=====
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 常見 LaTeX 指令 → Unicode 符號
function convertLatex(s) {
  const map = {
    "\\rightarrow": "→", "\\to": "→", "\\Rightarrow": "⇒", "\\implies": "⇒",
    "\\leftarrow": "←", "\\gets": "←", "\\Leftarrow": "⇐",
    "\\leftrightarrow": "↔", "\\Leftrightarrow": "⇔", "\\iff": "⇔",
    "\\uparrow": "↑", "\\downarrow": "↓",
    "\\times": "×", "\\div": "÷", "\\pm": "±", "\\mp": "∓", "\\cdot": "·",
    "\\leq": "≤", "\\le": "≤", "\\geq": "≥", "\\ge": "≥",
    "\\neq": "≠", "\\ne": "≠", "\\approx": "≈", "\\equiv": "≡",
    "\\ldots": "…", "\\dots": "…", "\\cdots": "⋯",
    "\\infty": "∞", "\\partial": "∂", "\\nabla": "∇", "\\sum": "∑",
    "\\prod": "∏", "\\int": "∫", "\\sqrt": "√", "\\forall": "∀", "\\exists": "∃",
    "\\in": "∈", "\\notin": "∉", "\\subset": "⊂", "\\cup": "∪", "\\cap": "∩",
    "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ",
    "\\epsilon": "ε", "\\theta": "θ", "\\lambda": "λ", "\\mu": "μ",
    "\\pi": "π", "\\rho": "ρ", "\\sigma": "σ", "\\tau": "τ", "\\phi": "φ",
    "\\omega": "ω", "\\Delta": "Δ", "\\Sigma": "Σ", "\\Omega": "Ω", "\\Pi": "Π",
  };
  return s.replace(/\\[a-zA-Z]+/g, (m) => (m in map ? map[m] : m));
}

function renderMarkdown(src) {
  console.log("[Friday] renderMarkdown 已執行,原始長度:", src.length);
  // 1. 先抽出多行程式碼區塊(避免內容被其他規則轉換)
  const codeBlocks = [];
  let text = src.replace(/```[ \t]*(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(escapeHtml(code.replace(/\n$/, "")));
    return ` CB${codeBlocks.length - 1} `;
  });

  // 2. 轉義其餘 HTML 特殊字元
  text = escapeHtml(text);

  // 3. 數學符號:先處理 $...$ 包裝,再處理裸露的 LaTeX 指令
  text = text.replace(/\$([^$\n]+)\$/g, (_, expr) => convertLatex(expr));
  text = convertLatex(text);

  // 4. 行內程式碼
  text = text.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // 5. 粗體、斜體
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");

  // 6. 逐行處理清單與段落
  const lines = text.split("\n");
  let html = "";
  let listType = null;
  let para = [];
  const flushPara = () => {
    if (para.length) {
      html += "<p>" + para.join("<br>") + "</p>";
      para = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  let quote = [];
  const flushQuote = () => {
    if (quote.length) {
      html += "<blockquote>" + quote.join("<br>") + "</blockquote>";
      quote = [];
    }
  };

  for (const line of lines) {
    const cb = line.match(/^ CB(\d+) $/);
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    // 注意:此時 > 已被 escapeHtml 轉成 &gt;
    const bq = line.match(/^\s*&gt;\s?(.*)$/);
    // 分隔線:整行為 ---、***、___(三個以上)
    const hr = line.match(/^\s*([-*_])\1{2,}\s*$/);

    if (cb) {
      flushPara();
      flushQuote();
      closeList();
      html += `<pre class="code-block"><code>${codeBlocks[+cb[1]]}</code></pre>`;
    } else if (hr) {
      flushPara();
      flushQuote();
      closeList();
      html += "<hr>";
    } else if (heading) {
      flushPara();
      flushQuote();
      closeList();
      const level = heading[1].length + 2; // # → h3, ## → h4 …
      html += `<h${level}>${heading[2]}</h${level}>`;
    } else if (bq) {
      flushPara();
      closeList();
      quote.push(bq[1]);
    } else if (ul) {
      flushPara();
      flushQuote();
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${ul[1]}</li>`;
    } else if (ol) {
      flushPara();
      flushQuote();
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${ol[1]}</li>`;
    } else if (line.trim() === "") {
      flushPara();
      flushQuote();
      closeList();
    } else {
      flushQuote();
      closeList();
      para.push(line);
    }
  }
  flushPara();
  flushQuote();
  closeList();

  // 保險:替換任何殘留的程式碼區塊佔位符
  html = html.replace(
    / CB(\d+) /g,
    (_, i) => `<pre class="code-block"><code>${codeBlocks[+i]}</code></pre>`
  );
  return html;
}

// ===== 語音互動 =====
// 皆為瀏覽器原生 Web API,無金鑰、無後端、永久免費;不支援的瀏覽器直接停用對應按鈕。
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

const VOICE_REPLY_KEY = "friday_voice_reply";
let isListening = false;
let recognition = null;
let voiceReplyEnabled = localStorage.getItem(VOICE_REPLY_KEY) !== "0"; // 預設開啟

function updateVoiceToggleUI() {
  voiceToggleBtn.classList.toggle("active", voiceReplyEnabled);
  voiceToggleBtn.title = voiceReplyEnabled ? "語音回覆:開啟(點擊關閉)" : "語音回覆:關閉(點擊開啟)";
}

if (!synth) {
  voiceToggleBtn.disabled = true;
  voiceToggleBtn.title = "這個瀏覽器不支援語音朗讀";
} else {
  voiceToggleBtn.addEventListener("click", () => {
    voiceReplyEnabled = !voiceReplyEnabled;
    localStorage.setItem(VOICE_REPLY_KEY, voiceReplyEnabled ? "1" : "0");
    updateVoiceToggleUI();
    if (!voiceReplyEnabled) {
      synth.cancel();
      setHudState("idle");
    }
  });
  updateVoiceToggleUI();
}

// 把 Markdown 原始文字轉成適合朗讀的純文字(去除語法符號,保留內容)
function stripForSpeech(src) {
  let text = src.replace(/```[\s\S]*?```/g, ""); // 程式碼區塊不適合念出來,直接跳過
  text = convertLatex(text); // 數學符號 → Unicode,與畫面顯示一致
  text = text.replace(/`([^`\n]+)`/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2").replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2");
  text = text.replace(/^#{1,3}\s+/gm, "");
  text = text.replace(/^\s*[-*+]\s+/gm, "").replace(/^\s*\d+\.\s+/gm, "");
  text = text.replace(/^\s*>\s?/gm, "");
  text = text.replace(/^\s*([-*_])\1{2,}\s*$/gm, "");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return text.trim();
}

function pickChineseVoice() {
  return synth.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("zh")) || null;
}

function speak(rawText) {
  if (!synth || !voiceReplyEnabled) return;
  const text = stripForSpeech(rawText);
  if (!text) return;
  synth.cancel(); // 避免多段回覆疊在一起念
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-TW";
  const voice = pickChineseVoice();
  if (voice) utter.voice = voice;
  utter.onstart = () => setHudState("speaking");
  utter.onend = () => setHudState("idle");
  utter.onerror = () => setHudState("idle");
  synth.speak(utter);
}

function setListening(listening) {
  isListening = listening;
  micBtn.classList.toggle("listening", listening);
  setHudState(listening ? "listening" : "idle");
}

if (!SpeechRecognitionAPI) {
  micBtn.disabled = true;
  micBtn.title = "這個瀏覽器不支援語音輸入";
} else {
  micBtn.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
      return;
    }
    if (synth) synth.cancel(); // 開始說話前,先打斷正在朗讀的回覆

    recognition = new SpeechRecognitionAPI();
    recognition.lang = "zh-TW";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      inputEl.value = transcript;
      autoResize();
      if (e.results[e.results.length - 1].isFinal) {
        sendMessage();
      }
    };

    recognition.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        addMessage("沒有取得麥克風權限,請在瀏覽器設定允許存取麥克風後再試一次。", "assistant");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        addMessage("語音輸入發生錯誤(" + e.error + "),請再試一次。", "assistant");
      }
    };

    recognition.onend = () => setListening(false);

    recognition.start();
  });
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
    // 助手回覆:轉成 Markdown 排版(使用者訊息與錯誤訊息維持純文字)
    typing.classList.add("markdown");
    typing.innerHTML = renderMarkdown(reply);
    history.push({ role: "model", parts: [{ text: reply }] });
    speak(reply);
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
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: history,
      }),
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
