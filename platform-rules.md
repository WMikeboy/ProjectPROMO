# 社交平台規則與 ProjectPROMO 整合分析

查證日期：2026-09-15。範圍：首版 X、Facebook；擴充比較 Instagram、TikTok、YouTube、LinkedIn。聚焦自然內容發佈、媒體、授權、數據、自動化及 SaaS 上線門檻；不包含完整廣告投放政策或所有產業內容規範。

官方文件可讀不等於已取得帳號權限。本輪未登入平台、申請 App、付費或實際發文。本文區分官方規則、工程推論與待驗證項目。

## 決策摘要

| 平台 | 主要整合路徑 | 關鍵門檻 | 對本產品的建議 |
| --- | --- | --- | --- |
| X | 官方 API、用戶 OAuth | 自動化同意、按量費用、禁止非 API 網站自動化 | 首版先打通；不設 computer use 備援 |
| Facebook | Page Token／Graph API | 須確認目標為 Page；發佈及 Insights 權限仍需補驗證 | 首版保留，但先做權限驗證 |
| Instagram | 官方 Instagram API | Professional 帳號、登入路徑與權限 | FB 之後的擴充候選 |
| TikTok | Content Posting API | 審核、公開可見性、強制 UX、用途資格 | 延後至公開 SaaS 產品可展示時 |
| YouTube | Data API + Analytics API | 公開上傳審核、OAuth 與配額 | 影片需求確定後擴充 |
| LinkedIn | Community Management API | Development／Standard 審核 | 有 B2B 客群後評估 |

以上優先順序為本產品的工程判斷，依據如下。

## 1. X：API 可行，computer use 不適合作為備援

### 官方規則

X 自動化規則明確禁止非 API 自動化（例如 scripting the website）；亦限制單一或多帳號的重複／高度相似自動貼文、垃圾訊息與自動操縱熱門話題。OAuth 授權本身不等於同意所有自動行為，應說明動作並取得明確同意、允許停止。這不等於禁止把自身原創內容分別發到 X 與 Facebook。[自動化規則](https://help.x.com/en/rules-and-policies/x-automation)

### 授權與發佈

使用用戶授權；OAuth 文件列出 tweet.read、tweet.write、users.read、media.write 等 scopes，offline.access 用於取得 refresh token。實際最小 scope 集合依所用 endpoint 確認。建立帖子與上傳媒體分開處理。[OAuth](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)、[發佈](https://docs.x.com/x-api/posts/create-post)

### 媒體

官方 media best practices 列出最多 4 張照片、1 個 GIF 或 1 支影片；圖片 5 MB、GIF 15 MB。影片文件列有 512 MB、0.5–140 秒等條件，但同頁區分 category、訂閱與建議值，不能推廣成所有 API／帳號的統一上限。實作時驗證選定上傳路徑，保存規則版本；混合圖片影片與長影片先標記待驗證。[媒體規格](https://docs.x.com/x-api/media/quickstart/best-practices)

### 指標與費用

可查回覆、按讚、轉發、引用、曝光等；私有指標需自身內容與用戶授權。non-public、organic、promoted 指標有貼文建立後 30 天的取得限制。曝光非去重人數；影片 views 可能是跨使用該影片的帖文聚合，不能盲目按每帖加總。[Metrics](https://docs.x.com/x-api/fundamentals/metrics)

API 按量計費；不同 endpoint／資源計價不同，含 URL 的發文有獨立價格。Owned Reads 有指定 endpoint 與帳號條件，自用便宜不代表客戶 SaaS 全部適用。報價和預算應以開發者控制台為準。[Pricing](https://docs.x.com/x-api/getting-started/pricing)

### 產品落地

- X 自動分發使用 API；失敗先核對、重試或人工接手，不改走自動 UI。
- Human review 保存內容快照、帳號、時間與明確提交紀錄。
- 同一 X 帳號的重複排程與跨 X 帳號相似內容需要檢查。
- 公開數據、私有數據、影片數據分開定義與儲存。

## 2. Facebook：先確認 Page，尚有權限查證缺口

### 本輪已驗證

Meta 官方 Postman workspace 提供 /me/accounts，透過 User Access Token 取得用戶管理的 Page、tasks 與 Page Access Token。Page Token 代表有權管理的 Page；「商業帳號」不能直接當作此權限的證明。[官方 Facebook collection](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)、[官方 workspace 身分](https://www.postman.com/meta/facebook/overview)

Meta 官方說明指出，未經許可透過自動化取得 Facebook 資料違反其條款。该說明發布於 2021 年，本輪可讀；不把它當作最新各項細則的完整替代。[Meta 反 scraping 說明](https://about.fb.com/news/2021/04/how-we-combat-scraping/)

### 未完成驗證，不能據此承諾功能

本輪 Pages posts／Insights 主文件無法讀取（包括 429）。以下是下一步需在官方文件／App Dashboard 確認的檢查清單，並非已通過的權限結論：

- Page 身分、管理者 tasks、App 模式與用戶角色。
- pages_show_list、pages_read_engagement、pages_manage_posts、read_insights 對本用途的需求。
- 向外部客戶提供服務時的 App Review、Advanced Access、Business Verification 適用條件。
- feed、photos、video／Reels 各自格式、字數、大小、時間與混合媒體限制。
- 當前 Graph API 版本可查的觀看、留言、反應、分享、觸及等指標及存取期限。
- 撤銷授權、資料刪除、Data Use Checkup 等實際要求。

[待查：Pages 發文](https://developers.facebook.com/docs/pages-api/posts/)、[待查：Insights](https://developers.facebook.com/docs/pages-api/insights/)

### 產品落地

先顯示 Page 名稱、ID、權限狀態。做出一篇測試內容的發佈與指標讀取後，才標示該帳號整合成功。首版不承諾個人動態、社團、廣告管理或任意公開貼文分析。未取得 UI 自動化許可前，不把 computer use 當作 API 授權的替代。

## 3. Instagram：適合後續擴充，但需區分登入方式

Meta 官方 collection 說明 Professional（Business／Creator）帳號的媒體發佈與管理；Facebook Login 路徑要求連結 Page，不能讀取一般 consumer 帳號。其列出的 Stories 發佈限 Business 帳號。文件同時存在 Instagram Login 路徑，不能將前一條路徑的 Page 要求套用到所有整合方式。[官方 Instagram collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-6fa9ed1d-3310-4844-ad25-f0001ab66f11)

官方 Reels 範例流程為建立 container → 查詢處理狀態 → media_publish；container ID 不是最終帖子 ID。[Reels 流程](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)

工程結論：分發狀態需區分 uploading、processing、published。文字型 Sheet 若沒有合適媒體不能直接視為可發佈。具體輪播上限、Insights 權限／指標、App Review、AI 標示與最新媒體規格本輪未完整確認，擴充前補查。

## 4. TikTok：UX 和審核會影響通用表單

Direct Post 需 video.publish 的 App 批准及用戶授權；未審核 client 的內容受私人可見限制。[Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started)

官方 Guidelines 明列：工具應面向廣泛使用者；僅幫自己／團隊帳號上傳的內部工具不符合列出的用途。發文介面需取得最新 creator info、展示帳號、讓用戶選擇隱私（不可預設），提供所需互動選項與商業內容揭露、預覽及明確同意。長度依 creator info，並受創作者／App 配額限制；不可自行加上 SaaS 宣傳浮水印。伺服器媒體 URL 路徑需按規則驗證。[Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)

Display API v2 的 video.query 可讀授權使用者影片的 view_count、like_count、comment_count、share_count 等，需 video.list scope；發佈授權不等於分析授權。[Video Query](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query)

工程結論：保留單份內容，但分發目標需有平台專屬發布設定。無法用一個沒有附加設定的通用按鈕涵蓋所有要求。自用驗證與面向公眾的 SaaS 審核應分階段；排程如何保留有效同意及最新 creator info 需另驗證。

## 5. YouTube：上傳與 Analytics 分開授權

2020-07-28 後建立的未驗證 API project 經 videos.insert 上傳的影片會限制為私人；解除需要合規 audit。這是 API project 層級門檻，不是用戶已登入就可跳過。[Videos insert](https://developers.google.com/youtube/v3/docs/videos/insert)

觀看、互動、時間維度等分析由 Analytics／Reporting API 提供；營收資料有額外 scope 與可用性条件。[Analytics Query](https://developers.google.com/youtube/analytics/reference/reports/query)

官方資料模型亦提醒 Data API 儲存的 resource metadata 需每 30 天刷新或刪除；應按資料類型套用保存政策，不把所有資料永久快取。[資料模型](https://developers.google.com/youtube/analytics/data_model)

工程結論：視頻處理成功、公开可見與分析可用分開顯示。純文字／圖片 Sheet 不適合當作普通影片發佈。OAuth 驗證與上傳 audit 分開追蹤；Shorts 分類、AI 合成內容揭露與音樂版權另作上線前檢查。

## 6. LinkedIn：B2B 擴充需準備商業審核

Community Management API 包含公司頁管理、貼文互動與分析，分 Development 與 Standard tier。Standard 升級需要展示所申請用途的錄影。[Overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-04)

官方 App Review 列出商業 email、組織／網站驗證及相關 LinkedIn Page 等要求；不能預設個人開發 App 已可服務所有客戶。[App Review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-app-review?view=li-lms-2026-06)

工程結論：若主打 B2B 再提高優先級。member 與 organization 權限要分開；媒體規格、各指標 scope、個人貼文能力及 UI 自動化條款本輪未全面驗證。

## 7. 對 Content Sheet 與分發設計的調整

以下為根據上述規則的產品設計建議：

1. 保持一張 Sheet 一份內容；增加目標層的 publishing_options（可見性、留言設定、商業內容揭露等），不引入不同平台文案 overrides。
2. 每個 adapter 保存能力、API 版本、規則來源／檢查日期。連接帳號後只顯示已驗證能力。
3. human review 需包含目標帳號、內容、素材、時間和必要揭露；各平台有額外 UX 時顯示對應設定。
4. 狀態分成授權有效、素材處理、已發佈、可見性、指標同步，避免單一 success 誤導用戶。
5. API 失敗不自動切換 UI；computer use 僅對已確認允許的「平台 × 操作」啟用。X 非 API 自動化停用。
6. 指標記錄 metric_name、definition、scope、period、fetched_at、source；缺失非零，曝光非去重人數。
7. 對平台資料增加 refresh/delete policy，授權撤銷後停止新工作並依適用政策處理既有資料。
8. 人工上傳也保存素材來源及商業使用資訊；AI 標示／商業合作／音樂權利要求需在相關平台上線前核對，不以人工上传免除。

## 下一步驗證清單

- X：App 與用戶 OAuth、媒體上傳、一次人工指定測試發文、帖子核對、公開／私有指標、實際計費。
- Facebook：確認 Page、讀出 tasks/token 能力，補全官方權限與 App Review 清單，再測同一閉環。
- 上線前：為實際支援媒體與 endpoint 建立版本化限制表；尚未確認的欄位顯示未支援，不能猜測數字。
- 其他平台：本報告作擴充方向，不代表已完成全部規則審查或已取得接入資格。
