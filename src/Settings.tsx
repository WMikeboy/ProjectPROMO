import { useState } from "react";
import { api, names } from "./api";
export default function Settings({
  state,
  refresh,
  onError,
}: {
  state: any;
  refresh: () => Promise<any>;
  onError: (s: string) => void;
}) {
  const [context, C] = useState(state.brand),
    [key, K] = useState(""),
    [model, M] = useState(state.deepseek.model),
    [token, T] = useState(""),
    [platform, P] = useState("x"),
    [pageId, Id] = useState(""),
    [status, Status] = useState("");
  async function save(fn: () => Promise<any>) {
    Status("處理中…");
    try {
      await fn();
      await refresh();
      Status("已儲存");
    } catch (e) {
      Status("");
      onError((e as Error).message);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="section-title">品牌常駐 CONTEXT</div>
        <p className="muted">在多篇創作間重用。修改此處會影響之後的對話。</p>
        <textarea
          rows={13}
          value={context}
          onChange={(e) => C(e.target.value)}
          placeholder="品牌名稱、產品資訊、受眾、語氣、禁用說法…"
        />
        <button
          onClick={() => void save(() => api("/brand", { context }, "PUT"))}
        >
          儲存品牌 context
        </button>
      </section>
      <div>
        <section className="panel">
          <div className="section-title">
            DEEPSEEK{" "}
            <span>{state.deepseek.configured ? "已設定" : "未設定"}</span>
          </div>
          <label>
            Model ID
            <input value={model} onChange={(e) => M(e.target.value)} />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={key}
              onChange={(e) => K(e.target.value)}
              placeholder="留空保留現有金鑰"
            />
          </label>
          <button
            onClick={() =>
              void save(async () => {
                await api("/deepseek", { key, model }, "PUT");
                K("");
              })
            }
          >
            儲存模型設定
          </button>
          <p className="muted">
            首版使用自帶金鑰；平台付費額度與媒體生成接口尚未啟用。
          </p>
        </section>
        <section className="panel">
          <div className="section-title">平台連接</div>
          {state.oauthX && (
            <p>
              <a href="/api/oauth/x/start">使用 X OAuth 連接帳號 →</a>
            </p>
          )}
          {state.accounts.map((a: any) => (
            <p className="connected" key={a.platform}>
              <span className="dot" />
              {names[a.platform]} · {a.name}
              <small>{a.id} · 已驗證身分，發佈權限待實際請求確認</small>
            </p>
          ))}
          <select value={platform} onChange={(e) => P(e.target.value)}>
            <option value="x">X · User access token</option>
            <option value="facebook">Facebook Page · Page access token</option>
            <option value="threads">Threads · User access token</option>
            <option value="instagram">Instagram · Instagram Login token</option>
          </select>
          {platform === "facebook" && (
            <label>
              Page ID
              <input value={pageId} onChange={(e) => Id(e.target.value)} />
            </label>
          )}
          <label>
            Access Token
            <input
              type="password"
              value={token}
              onChange={(e) => T(e.target.value)}
            />
          </label>
          <button
            onClick={() =>
              void save(async () => {
                await api("/accounts", { platform, token, pageId });
                T("");
              })
            }
          >
            驗證並連接
          </button>
          <p className="muted">
            自用試版使用手動 token。X 需要用戶授權，Facebook 需要 Page Token。X
            也可在 .env 配置 OAuth；Threads 和 Instagram 使用各自的 Token，Instagram 使用 Instagram Login。媒體分發需設定公開 HTTPS 素材網址（MEDIA_PUBLIC_BASE_URL）；純文字 Threads 不需要。Facebook 公開 SaaS onboarding 尚未實作。
          </p>
        </section>
        <small>{status}</small>
      </div>
    </div>
  );
}
