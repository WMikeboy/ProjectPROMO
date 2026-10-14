# ProjectPROMO

[日本語](readme.md) | [English](README.en.md) | [繁體中文](README.zh-TW.md)

**和 AI 一起創作，一次整理，多平台分發。**

ProjectPROMO 是 AI 輔助社群宣傳工作區，將品牌資料、文案、圖片與影片整理成 Content Sheet，經人工審閱後排程發布，並集中管理各平台的帖子狀態和成效。

目前是可在本機執行的 **單工作區 pilot**，長期目標為 SaaS。尚未具備正式多租戶服務的帳號隔離、權限管理與計費能力。

## 工作流程

```text
品牌 Context + 與 AI 對話
           ↓
Content Sheet（草稿自動儲存）
           ↓
人工 Review → 立即發布 / 預定時間
           ↓
各平台獨立分發工作 → 狀態、帖子 ID 與 URL
           ↓
數據同步 → Dashboard
```

一張 Sheet 代表一份共用內容，可選擇多個平台。需要不同平台文案時，複製成另一張 Sheet 再調整。

## 已實作功能

- **AI 創作聊天室**：使用自帶 DeepSeek API Key，建立、讀取、修改及複製草稿；模型 ID 可設定。
- **品牌常駐 Context**：保存品牌定位、語氣和產品資訊，帶入後續創作。
- **內容編輯**：標題、內文、Tags、媒體、平台及發布時間，支援自動儲存、版本檢查、撤銷與示意預覽。
- **人工審閱**：批次確認後建立不可變的發布快照；AI 沒有直接批准或發布工具。
- **分發管理**：各平台獨立成功或失敗；不確定結果需人工核對，避免盲目重試造成重複發布。
- **Dashboard**：保存平台回傳的數據快照；未取得的數據顯示空缺，不模擬成效。

## 平台支援

| 平台 | 連接方式 | 已實作的發布接口 |
| --- | --- | --- |
| X | OAuth 2.0 PKCE 或 User Access Token | 文字、圖片、影片 |
| Facebook Page | Page Access Token | 文字、圖片、影片 |
| Threads | Threads User Access Token | 文字、JPG/PNG、多圖、單支 MP4 |
| Instagram | Instagram Login Token，專業帳號 | JPG、最多四張圖片、單支 MP4 Reel |

接口實作不保證任意帳號都能使用；仍取決於平台權限、媒體規格、配額與審核。各平台可取得的指標不同。Threads／Instagram 的模擬接口測試已涵蓋部分流程，真實帳號端到端驗證仍待完成。

## 快速啟動

需要 Node.js 20.19+ 與 npm。

```powershell
npm ci
Copy-Item .env.example .env
```

編輯 `.env`，把 `ADMIN_PASSWORD` 改成自己的長密碼。DeepSeek 和社交平台 Token 可在登入後的「品牌與連接」設定；X OAuth 的 Client ID、Secret 與 Callback 在 `.env` 設定。

```powershell
npm run build
npm start
```

開啟 [本機工作區](http://127.0.0.1:4100/)。不要同時啟動多個後端，共用同一份本機資料庫。

開發模式可用 `npm run dev`；前端開發入口為 `http://127.0.0.1:5173/`。驗證指令：

```powershell
npm run check
```

## 媒體發布與公開網址

X／Facebook 的接口直接上傳素材。Threads／Instagram 目前由 Meta 從 HTTPS 網址抓取本機素材，因此需要：

```dotenv
MEDIA_PUBLIC_BASE_URL=https://your-media-host.example
```

`server/media-gateway.mjs` 提供僅接受素材讀取的本機代理（4101 埠），可接到你自己的 HTTPS 反向代理或 Tunnel。素材 URL 有簽名並於 24 小時後到期；持有有效連結者仍可讀取素材。不要將管理介面直接暴露到公網。

Tunnel 不會由 `npm start` 自動啟動。臨時 Tunnel 的網址改變後，須更新環境設定並重啟服務；平台抓取媒體期間，服務與 Tunnel 必須保持運作。

## 技術棧

- React、TypeScript、Vite
- Node.js、Express、Zod
- PostgreSQL；預設使用本機 PGlite
- SQL 工作佇列、平台 API adapters
- DeepSeek 工具呼叫、本機媒體儲存、AES-256-GCM 憑證加密

## 目前限制

- 本機單一管理者版本，尚未完成多租戶、安全部署與 SaaS 計費。
- 圖片／影片由人工加入；生成供應商接口僅預留，未接入實際生成服務。
- 品牌 Context 已實作，產品 RAG 知識庫尚未實作。
- Facebook／Threads／Instagram Token 需手動維護；X OAuth 支援刷新。
- 社交平台 API 可能收費，亦有各自的授權和使用限制；本專案不提供免費平台額度。
- 尚未實作 Computer Use 發布執行器。
- API 接受發布不代表立即公開可見，仍需核對平台結果。

## 文件

- [執行與設定說明](RUNNING.md)
- [完整產品規劃（含未實作項目）](PRODUCT-PLAN.md)
- [平台規則研究](platform-rules.md)
- [安全 review 與已知限制](SECURITY-REVIEW.md)

`.env`、本機資料庫、上傳素材、日誌及私鑰檔不納入 Git。請勿在 Issue、截圖或提交中貼出 Token 或 Secret。

## 授權

本專案採用 [MIT License](LICENSE)。社交平台與第三方服務仍適用各自的使用條款。
