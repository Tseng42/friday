# Friday

純前端的 Gemini 聊天助手網頁。沒有後端、沒有建置工具,開啟 `index.html` 或用任何靜態伺服器就能跑。

## 功能特色

- **對話介面**:氣泡式聊天畫面,支援多輪對話(前端保存完整對話歷史,讓 Gemini 記得前文)。
- **直連 Gemini API**:瀏覽器直接呼叫 Google `generateContent` REST endpoint,目前使用 `gemini-3.6-flash` 模型。
- **API 金鑰自行設定**:點右上角齒輪圖示貼上金鑰,只存在瀏覽器 `localStorage`,不會上傳到任何伺服器(因為根本沒有伺服器)。
- **輕量 Markdown 渲染**:助手回覆支援標題、粗體/斜體、行內程式碼、程式碼區塊、清單,並把常見 LaTeX 指令(`\alpha`、`\sum`…)轉成 Unicode 符號。
- **輸入體驗**:文字框自動長高、Enter 送出 / Shift+Enter 換行、送出中鎖定輸入避免重複送出、「思考中…」動態提示。
- **中文錯誤訊息**:依 HTTP 狀態碼(400/401/403/429/500/503)轉成可讀的中文錯誤說明,並保留原始除錯資訊。

## 技術棧

純 HTML / CSS / JavaScript,沒有框架、沒有 npm、沒有建置工具。

## 本機執行

需要一組 [Gemini API 金鑰](https://aistudio.google.com/apikey)。

直接用瀏覽器開啟 `index.html` 即可;若瀏覽器對 `file://` 有限制,可起一個靜態伺服器:

```bash
python -m http.server 8000
```

開啟 <http://localhost:8000>,點右上角齒輪貼上你的 Gemini API 金鑰即可開始對話。

> ⚠️ **金鑰安全性**:金鑰是在瀏覽器前端直接呼叫 Google API,任何能存取這台瀏覽器/這份程式碼的人都看得到金鑰。僅適合個人本機使用或原型測試,**不要**把設定好金鑰的頁面部署成公開網站。

## 專案結構

```
index.html    # 頁面結構:對話區、輸入框、設定對話框
script.js     # 對話邏輯、Gemini API 呼叫、Markdown 渲染、錯誤處理
style.css     # 深色主題樣式
```
