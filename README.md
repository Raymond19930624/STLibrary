# STLibrary

## Bot 執行
- 進入 `bot` 資料夾
- 編輯 `config.json` 設定：
  - `BOT_TOKEN`: Telegram Bot Token
  - `CHANNEL_ID`: 目標頻道 ID（如 `-100xxxxxxxxxx`）
  - `LAST_UPDATE_ID`: 初次可設 `0`
- 安裝依賴：`npm install`
- 執行：`npm start`
- Bot 會：
  - 讀取頻道新訊息
  - 配對被「回覆」的圖片與壓縮檔
  - 解析 caption 的 `name:`、`tags:`
  - 更新 `web/models.json`
  - 下載圖片到 `web/images/<id>.jpg`
  - 記錄 `LAST_UPDATE_ID` 避免重複

## 上傳格式
- 管理者上傳壓縮檔（zip/rar/stl）至頻道
- 以「回覆該壓縮檔訊息」上傳模型圖片
- Caption 範例：
```
name: RX-78-2 測試模型
tags: gundam, 1/144
```

## 靜態網站部署（GitHub Pages）
- 將 `web` 資料夾內容推送到 GitHub 倉庫
- 在 GitHub 的 Pages 設定選擇 `main` 分支與 `/(root)` 或 `web/` 資料夾
- 發佈後即可透過 GitHub Pages 存取網站

## 更新模型流程
1. 管理者在 Telegram 頻道上傳模型壓縮檔與回覆圖片
2. 在電腦執行 Bot：`npm start`
3. Bot 自動更新 `web/models.json` 並下載圖片
4. 將整個專案推送到 GitHub（包含 `web`）
5. GitHub Pages 自動更新顯示

## 注意事項
- 下載連結一律使用 `https://t.me/c/<ID>/<message_id>`（以頻道 ID 為準，對頻道改名具備抗改名能力）
- 圖片由 Bot 下載保存於 `web/images`，前端依 `id` 對應顯示
