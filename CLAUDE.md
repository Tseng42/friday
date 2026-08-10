# CLAUDE.md

Friday——純前端的 Gemini 聊天助手網頁。無後端、無建置工具,瀏覽器直接呼叫 Google Gemini REST API。

## 註解與文件規範

- 所有註解、commit message、本檔一律使用繁體中文。
- 使用者可見文字(UI 標籤、錯誤訊息)皆為繁體中文。

## 技術棧

- 純 HTML / CSS / JavaScript,無框架、無 npm、無建置工具。
- 呼叫 Gemini REST API(`generateContent`),模型見 `script.js` 的 `MODEL` 常數。
- API 金鑰存於瀏覽器 `localStorage`(鍵名 `friday_gemini_api_key`),不經任何伺服器。

## 專案架構

```
index.html    # 頁面結構:標題列、對話區(#messages)、輸入區(#input/#sendBtn)、設定對話框(#settingsModal)
script.js     # 全部邏輯集中於此(單檔):
              #   - API 金鑰存取(loadApiKey/saveApiKey)
              #   - 對話送出與 Gemini 呼叫(sendMessage/callGemini)
              #   - 依 HTTP 狀態碼轉中文錯誤訊息(mapErrorMessage)
              #   - 輕量 Markdown → HTML 轉換,含 LaTeX 指令轉 Unicode(renderMarkdown/convertLatex)
style.css     # 深色主題;CSS 變數集中於 :root(--bg/--accent 等)
```

## 關鍵慣例

- **對話歷史**(`history` 陣列)採 Gemini API 格式 `{ role: "user"|"model", parts: [{ text }] }`,呼叫失敗時要把剛 push 進去的使用者訊息 `pop()` 掉,避免下一輪帶著錯誤上下文。
- **金鑰未設定時不呼叫 API**:`sendMessage` 會先檢查 `loadApiKey()`,沒有金鑰就直接提示使用者去設定,不送出請求。
- **使用者訊息維持純文字**(`textContent`),只有助手回覆才跑 `renderMarkdown` 轉 HTML,避免使用者輸入被誤判為 HTML/Markdown 或造成 XSS。
- **Markdown 渲染順序**(`renderMarkdown`):先抽出多行程式碼區塊(佔位保留)→ `escapeHtml` 轉義 → LaTeX 符號轉換 → 行內語法(code/bold/italic)→ 逐行處理清單/標題/段落 → 還原程式碼區塊。改動渲染規則時要留意這個順序,調換會讓程式碼區塊內容被誤轉換。
- **人格設定**(`SYSTEM_INSTRUCTION`):每次呼叫 Gemini 都會帶上 `systemInstruction` 欄位,定義 Friday 的說話風格(參考鋼鐵人 AI 管家:簡潔、自信、主動補充重點)。這不算對話歷史,不進 `history` 陣列,只在 `callGemini()` 組請求時加入。調整人格時改這個常數即可,不用動 `history` 相關邏輯。

## 產品方向

長期目標是把這個聊天助手往「鋼鐵人裡的 Friday」方向推進,而不只是文字聊天框。規劃路線圖(依序):
1. 人格與應答風格(`SYSTEM_INSTRUCTION`)—— 已完成
2. 語音互動(`SpeechRecognition` 語音輸入 + `SpeechSynthesis` 語音朗讀回覆)—— 已完成。`micBtn`/`voiceToggleBtn` 在不支援的瀏覽器會自動停用並提示;`recognition` 為模組層級變數(不可在事件處理常式內用 `const` 重新宣告,否則重複點擊會有 TDZ 錯誤);朗讀前會呼叫 `stripForSpeech()` 把 Markdown 轉純文字,並在開始聆聽/新回覆前 `synth.cancel()` 避免疊音
3. 視覺介面全息化(HUD 風格改版)—— 已完成。標題列的 `logo` 換成 `.hud-core`(旋轉光環 + 呼吸光點的 SVG)與 `#hudStatus`(待命中/聆聽中…/回覆中…文字),全部靠 `#app` 根元素的 `data-state` 屬性(`idle`/`listening`/`speaking`)驅動顏色與動畫,狀態切換邏輯在 `setHudState()`(`script.js`)。頂欄下方加了掃描光線動畫。之後再做過一輪「玻璃霧感 + 冷光藍」配色與「銳利邊角+HUD 邊角記號」的質感優化(把 `--radius` 從 18px 降到 8px、按鈕/輸入框全面改小圓角、助手氣泡與輸入框/設定卡片加上 `::before`/`::after` 畫的邊角記號、背景加淡科技網格、每則訊息加等寬字體時間戳記)。注意 `<textarea id="input">` 外面包了一層 `.input-frame` div 才能放邊角記號,因為 `::before`/`::after` 不會渲染在 `<textarea>` 上。

之後跟使用者確認過電影裡實際的視覺語言是藍色線框全息(不是紅金——那是戰甲烤漆色,跟 JARVIS/Friday 的數位介面是兩回事),於是把方向 A 往「線框全息」再深化一輪:HUD 核心圖示加了第二圈反向旋轉的外環(`.hud-core-outer`,更像瞄準環);標題列/輸入區的玻璃背景加了細緻藍圖網格(內部 16px grid,疊在原本的 rgba 底色上);助手氣泡新增出現時的材質化光暈動畫(`hologram-flash`,只用在助手氣泡,因為使用者氣泡已有常駐 box-shadow,疊加動畫會互相覆蓋);`--assistant-bubble` 透明度從 0.5 降到 0.4,讓玻璃更透一點呼應「投影」而非「實體卡片」的感覺。所有新動畫都有 `prefers-reduced-motion: reduce` 的降級處理。

**硬性限制:所有新增功能使用的服務都必須永久免費**,不能有計費或用量方案的風險。Web Speech API 是瀏覽器原生功能,符合此限制。Gemini API 免費額度是既有架構(使用者自帶金鑰),非本路線圖新增的成本。

## 本機開發

無建置步驟,直接開啟 `index.html`,或起靜態伺服器(見 README.md)。修改後重新整理瀏覽器即可看到結果。

## 已知限制

- 目前為前端直連 API,金鑰會暴露在瀏覽器中,不適合部署成公開網站(見 README.md 安全性警告)。若要上線給多人使用,需改為透過後端代理呼叫 Gemini,金鑰存在伺服器端。
