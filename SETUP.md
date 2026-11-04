# 設定說明（只需要做一次）

## 1. 開啟 GitHub Pages（網站網址）
1. 打開 repo 的 **Settings → Pages**
2. **Source** 選「**GitHub Actions**」（不要選 Deploy from a branch，否則短時間內多次更新會出現「in progress deployment」部署失敗）
3. 到 **Actions** 分頁，左邊選「部署網站」，按 **Run workflow** 部署一次
4. 約 1～2 分鐘後，網址是 **https://hswenforwork.github.io/phonics-kids/**；之後每次更新都會自動部署

## 2. 申請 Google 語音金鑰（產生英式 AI 語音）
1. 到 <https://console.cloud.google.com/> 用 Google 帳號登入，建立一個專案（名稱例如 phonics-kids）
2. 依畫面指示啟用帳單（需要綁信用卡；用量在免費額度內不會扣款）
3. **建議先設預算上限**：左側選單 **帳單 → 預算與快訊 → 建立預算**，金額可設 NT$100，並勾選寄信通知
4. 上方搜尋 **Cloud Text-to-Speech API**，按 **啟用**
5. 左側選單 **API 和服務 → 憑證 → 建立憑證 → API 金鑰**
6. 建立後按 **編輯 API 金鑰**：在「API 限制」選 **限制金鑰**，只勾 **Cloud Text-to-Speech API**，儲存
7. 複製金鑰（**不要貼到對話或任何檔案裡**）

## 3. 把金鑰放進 GitHub
1. 打開 repo 的 **Settings → Secrets and variables → Actions**
2. 按 **New repository secret**
3. Name 填 `GOOGLE_TTS_API_KEY`，Secret 貼上金鑰，按 **Add secret**
4. （選用）想換聲音：在同一頁的 **Variables** 分頁新增 `TTS_VOICE`，例如 `en-GB-Neural2-A`（預設是 `en-GB-Neural2-C` 英式女聲）

## 4. 產生語音檔
1. 打開 repo 的 **Actions** 分頁，左邊選 **產生語音檔**
2. 按右邊 **Run workflow → Run workflow**
3. 約 2～5 分鐘完成，網站會自動換成 AI 語音

之後只要單字庫有變動（例如用申請單加入新字），語音檔會自動補上。

## 申請單怎麼用
網站「家長模式」查字後會出現按鈕，點下去會開啟一張填好的 GitHub 申請單（Issue），按 **Submit new issue** 送出即可：
- **➕ 加入單字庫**：自動查音標、拆音節、翻中文、產生語音，放進「我的單字」🌟
- **🗂 換主題**：把「我的單字」裡的字移到其他主題
- **🛠 回報錯誤**：在申請單上直接改音標、音節或中文

為了安全，自動流程**只處理 repo 擁有者（hswenforwork）開的申請單**，別人開的單會被忽略。送出後約 1～3 分鐘，申請單會收到處理結果並自動關閉。
