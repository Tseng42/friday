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

## 本機開發

無建置步驟,直接開啟 `index.html`,或起靜態伺服器(見 README.md)。修改後重新整理瀏覽器即可看到結果。

## 已知限制

- 目前為前端直連 API,金鑰會暴露在瀏覽器中,不適合部署成公開網站(見 README.md 安全性警告)。若要上線給多人使用,需改為透過後端代理呼叫 Gemini,金鑰存在伺服器端。
