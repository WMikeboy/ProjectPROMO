# 啟動與驗證

## 目前交付範圍

這是可運行的單一工作區、自用 pilot，目標為 X 與 Facebook Page。不是已完成公開多租戶商業上線的 SaaS。

已實作：React 創作介面、品牌 context、DeepSeek 多步工具呼叫、多張 Sheet／衍生草稿、Tab 接受品牌標題建議、自動保存、版本衝突、撤銷、人工素材、預览、批次確認、排程佇列、X／Facebook API adapters、分平台結果、人工核對／重試、指標快照與 Dashboard。

## 啟動

需要 Node.js 20.19+，npm。

```powershell
npm install
Copy-Item .env.example .env
# 編輯 .env 的 ADMIN_PASSWORD，使用自己的長密碼
npm run build
npm start
```

開啟 http://127.0.0.1:4100 。若沒有配置 ADMIN_PASSWORD，啟動終端會顯示當次隨機密碼。程序重啟後需重新登入。

開發模式：

```powershell
npm run dev
```

前端 http://127.0.0.1:5173，後端 4100。X OAuth callback 預設回到 4100。

## 資料與部署

- 未填 DATABASE_URL：PGlite（嵌入式 PostgreSQL）保存到 data/db，不需 Docker。只允許單一 server 使用此資料目錄。
- 填 DATABASE_URL：使用外部 PostgreSQL。啟動時建立尚不存在的資料表；現階段以原生 SQL 實作，未使用規劃中的 Drizzle／pg-boss。
- 媒體保存在 data/uploads；不是 S3。金鑰以 AES-256-GCM 加密，開發環境的加密 key 保存在 data/key。備份需同時包含資料庫、uploads 和 key；保護整個 data 目錄。
- 不要提交 .env 或 data。若更換 ENCRYPTION_KEY，舊憑證將無法解密，需先規劃遷移。
- 預設僅綁定 127.0.0.1。公開服務前尚需 workspace／membership 隔離、正式身份認證、TLS／反向代理、S3、營運監控與平台審核。

## DeepSeek

「品牌與連接」填寫 API Key 與可用 model ID，或設 DEEPSEEK_API_KEY、DEEPSEEK_MODEL。金鑰不回傳前端。chatroom 使用官方 Chat Completions + Tool Calls；每次最多 8 輪、20 次工具操作，每輪 max_tokens=2500，不自動批准發文。

- Agent 可建立、查詢、複製、修改多张 Sheet；指定 ID 與 revision，後端驗證後執行。
- 品牌 context 目前支援文字輸入與跨創作重用；文件解析、持久 RAG、更多 context 匯入形式尚未接入。
- 手動修改與 agent 操作分開執行，agent 執行中編輯器暫時鎖定。
- Tab 預填目前採品牌 context 第一行作標題建議，並非背景偷偷呼叫模型。
- API 付費目前採 BYOK；平台計費額度、月預算帳本與用量結算仍待實作。

## X 連接

選項 A：設定 X_CLIENT_ID、X_CLIENT_SECRET（confidential client）、X_REDIRECT_URI。在開發者控制台登記完全一致的 callback，之後在設定點「使用 X OAuth 連接帳號」。採 PKCE 並請求 tweet.read、tweet.write、users.read、media.write、offline.access。OAuth 取得的 refresh token 會用於過期刷新。

選項 B：輸入具有用戶授權的 access token；app-only token 不足以代表用戶發文。手動 token 的期限需自行管理。

連接驗證只確認 /2/users/me 身分，不代表所有發佈／媒體權限已通過。API 帳戶需具備額度與所需 scopes。

- 文字透過 POST /2/tweets；圖片／影片使用 v2 initialize、append、finalize、status 上傳後掛到帖子。
- 自用第一版保守檢查 X 加權 280 字；不自動截斷。
- 目前同步 public_metrics，包括曝光、按讚、回覆、轉發等；私有點擊與影片細分指標尚未接入。
- 不使用 computer use 代替 X API。

## Facebook Page 連接

目前使用手動 Page Access Token，填入 Page ID。後端 /me 核對 token 身分必須與 Page ID 相同。

需在 Meta App／Graph API Explorer 取得對應 Page 的權限及 token。重點待驗證 scopes 為 pages_show_list、pages_read_engagement、pages_manage_posts；完整 Insights 則需另驗證 read_insights 及當前指標。App Review／Advanced Access／Business Verification 依用途與 App Dashboard 判定。

- 文字：/{page-id}/feed。
- 圖片：先 /photos 上傳 unpublished 素材，再 /feed attached_media。
- MP4：/{page-id}/videos；目前不提供 Reels 專用流程。
- 互動讀取：reactions、comments、shares。觀看／觸及未接 Insights，顯示不可用，不偽造零。
- GRAPH 版本由 FACEBOOK_GRAPH_VERSION 設定。Meta 主文件本次受讀取限制，實際端點、版本與 App 權限需以自己的 Page 測試。
- 未提供 Facebook OAuth Page 選擇器或公開 App 審核流程。

## 分發語義

草稿只存在 sheets，不建立 jobs。人工確認時於交易內凍結內容與建立每平台工作；任一驗證失敗，整批不提交。同 Sheet revision + platform 去重。再次要發佈同內容可複製新 Sheet。

Worker 每 5 秒處理到期工作。外部結果未知時 needs_attention，必須先核對；資料庫回寫失敗也不能盲目重發。人工重試按鈕要求確認平台未發佈，或可輸入已發佈 ID 關聯原工作。只可取消 queued 工作，不能撤銷已發出的帖子。

succeeded 表示 API 已回傳帖子 ID；介面顯示「API 已接受」。平台素材可能仍在處理，公開可見性需打開 URL 核對，不能等同所有讀者已可見。

指標每 6 小時嘗試同步一次，也可手動同步；失敗保留先前快照。同步失敗不改變發佈結果。

## 媒體範圍

人工上傳 JPG、PNG、WEBP、GIF、MP4，單檔 100 MB。按平台進一步檢查；影片／GIF 不與其他媒體混發。地理位置尚未實作發布，有值時阻擋提交。SaaS 上傳限制與平台最終限制不完全相同，平台仍可能拒絕不符合編碼、時長或帳號能力的素材。

圖片與影片生成只預留 server/media-provider.ts 的契約，不呼叫 zimage／minimax workflow。

## 檢查

```powershell
npm run check
```

目前 9 項測試：加權字數、媒體混合、缺失素材／日期、未知外部結果、版本衝突、批准快照／去重、整批交易 rollback、排程、部分成功與數據同步隔離、DeepSeek 多 Sheet 工具流程（部分案例共用一個 test）。

測試的 DB 使用記憶體，外部 API 使用 mock，沒有真實發文。瀏覽器已驗證登入、空白草稿建立、編輯自動保存、雙平台預覽、review 視窗。

## 真實連接仍需驗收

加入 DeepSeek Key、X 用戶 token／OAuth App、Facebook Page Token 後，先生成草稿，再由使用者指定一篇測試内容並人工確認。此環境尚未取得上述憑證，沒有驗證真實模型或平台回應；不能把 mock 通過當作上線驗收。

## Threads / Instagram (2026-09-16)
- Connect each platform in Settings using its own user access token. Instagram uses Instagram Login, not Facebook Page tokens. Tokens are encrypted; automatic renewal is not implemented yet.
- Threads: text, JPG/PNG, single MP4 video, or up to four images. Required permissions: threads_basic, threads_content_publish; insights need threads_manage_insights.
- Instagram: professional account, JPG photos, up to four photos, or single MP4 Reel. Requires instagram_business_basic and instagram_business_content_publish. Insights require the applicable Instagram Login insights permission. Unsupported metrics remain unavailable, not zero.
- Media must be reachable by Meta: configure MEDIA_PUBLIC_BASE_URL=https://your-public-media-host pointing to this server's /media/* route. Localhost URLs do not work. No tunnel or hosting is automatically provisioned. Prefer exposing only /media/* through your HTTPS reverse proxy; do not expose local administration unnecessarily.
- Generated media URLs are HMAC-signed and expire after 24 hours. Unsigned/expired requests are denied; media stays in local storage. The service and public endpoint must remain online while Meta fetches/processes media.
- Publishing creates containers, waits for processing, then publishes. Uncertain final responses require manual reconciliation. Permalink lookup failure after publish retains success and post ID.
- Validation/build/mock API tests are automated. Real Threads/Instagram publishing requires your tokens, permissions, and public media hosting; it has not been exercised automatically.
- API references: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api and https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login
