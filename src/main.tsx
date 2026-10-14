import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Sheet, postText, validatePublish } from "../shared/model";
import { api, names } from "./api";
import Editor, { Media } from "./Editor";
import Settings from "./Settings";
import "./style.css";
function App() {
  const [state, S] = useState<any>(null),
    [login, L] = useState(false),
    [pass, P] = useState(""),
    [page, V] = useState("studio"),
    [active, A] = useState(""),
    [error, E] = useState(""),
    [selection, Select] = useState<string[]>([]),
    [review, R] = useState<any[] | null>(null),
    [busy, B] = useState(false),
    [dirty, D] = useState(false),
    [epoch, Epoch] = useState(0),
    [chat, C] = useState("");
  async function refresh() {
    try {
      const d = await api("/state");
      S(d);
      L(false);
      return d;
    } catch (e) {
      if ((e as Error).message === "LOGIN") L(true);
      else E((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function action(fn: () => Promise<any>) {
    E("");
    try {
      return await fn();
    } catch (e) {
      E((e as Error).message);
    }
  }
  async function create() {
    if (dirty) throw Error("請等待目前 Sheet 儲存");
    const s = await api("/sheets", {});
    await refresh();
    A(s.id);
    V("studio");
  }
  if (login)
    return (
      <div className="login">
        <div className="brandmark">P↗</div>
        <h1>Welcome to PROMO.</h1>
        <p>登入你的創意工作區</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await api("/login", { password: pass });
              await refresh();
            });
          }}
        >
          <input
            autoFocus
            type="password"
            placeholder="管理密碼（.env 或啟動終端）"
            value={pass}
            onChange={(e) => P(e.target.value)}
          />
          <button>進入工作區 →</button>
        </form>
        <p className="error">{error === "LOGIN" ? "密碼不正確" : error}</p>
      </div>
    );
  if (!state) return <div className="login">正在開啟工作區… {error}</div>;
  const current = state.sheets.find((s: Sheet) => s.id === active),
    latest = new Map<string, any>();
  for (const m of state.metrics)
    if (!latest.has(m.job_id)) latest.set(m.job_id, m);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          PROMO<span>✳</span>
        </div>
        <div className="workspace">
          <span className="avatar">P</span>
          <div>
            My workspace<small>個人試用工作區</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        {[
          ["studio", "✧", "創作工作室"],
          ["posts", "▤", "分發與帖子"],
          ["dashboard", "◴", "Dashboard"],
          ["settings", "⚙", "品牌與連接"],
        ].map(([id, icon, label]) => (
          <button
            key={id}
            className={"nav " + (page === id ? "active" : "")}
            disabled={dirty || busy}
            onClick={() => V(id)}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
        <div className="sidebar-bottom">
          <span className="dot" /> API FIRST<small>{state.mode}</small>
          <button
            className="link"
            onClick={() => void api("/logout", {}).then(() => L(true))}
          >
            登出
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">YOUR IDEAS, EVERYWHERE</span>
            <h1>
              {page === "studio"
                ? "創作工作室"
                : page === "posts"
                  ? "分發與帖子"
                  : page === "dashboard"
                    ? "成效總覽"
                    : "品牌與連接"}
            </h1>
          </div>
          <div className="header-actions">
            <span className="pill">X · Facebook · Threads · Instagram</span>
            <button
              disabled={busy || dirty}
              onClick={() => void action(create)}
            >
              ＋ 新增 Sheet
            </button>
          </div>
        </header>
        {error && (
          <div role="alert" className="error-banner">
            {error}
            <button onClick={() => E("")}>×</button>
          </div>
        )}
        {page === "studio" && (
          <>
            <div className="intro">
              <div>
                <h2>從一個想法，到下一篇好內容。</h2>
                <p>和 AI 一起構思，保留你的決定權。</p>
              </div>
              <button
                className="secondary"
                disabled={!selection.length || dirty || busy}
                onClick={() =>
                  R(state.sheets.filter((s: Sheet) => selection.includes(s.id)))
                }
              >
                Review 與提交 {selection.length ? `(${selection.length})` : ""}{" "}
                →
              </button>
            </div>
            <div className="studio-grid">
              <section className="sheets-panel">
                <div className="section-title">
                  CONTENT SHEETS <span>{state.sheets.length}</span>
                </div>
                {!state.sheets.length ? (
                  <div className="empty">
                    <span>▧</span>
                    <h3>第一張 Sheet</h3>
                    <p>新增空白內容，或請右側 agent 建立多篇草稿。</p>
                    <button
                      className="secondary"
                      onClick={() => void action(create)}
                    >
                      建立空白 Sheet
                    </button>
                  </div>
                ) : (
                  state.sheets.map((s: Sheet) => (
                    <div
                      key={s.id}
                      className={
                        "sheet-card " + (active === s.id ? "chosen" : "")
                      }
                    >
                      <div className="card-top">
                        <input
                          aria-label={"選取 " + (s.content.title || "未命名")}
                          type="checkbox"
                          checked={selection.includes(s.id)}
                          onChange={(e) =>
                            Select(
                              e.target.checked
                                ? [...selection, s.id]
                                : selection.filter((id) => id !== s.id),
                            )
                          }
                        />
                        <small>草稿 · v{s.revision}</small>
                      </div>
                      <button
                        className="card-body"
                        disabled={dirty || busy}
                        onClick={() => A(s.id)}
                      >
                        <h3>{s.content.title || "未命名內容"}</h3>
                        <p>{s.content.body || "等待你的第一個想法…"}</p>
                        <div className="tags">
                          {s.content.platforms.map((p: string) => (
                            <span key={p}>{names[p]}</span>
                          ))}
                        </div>
                      </button>
                    </div>
                  ))
                )}
              </section>
              <section className="editor-panel">
                {current ? (
                  <fieldset className="editor-lock" disabled={busy}>
                    <Editor
                      key={active + ":" + epoch}
                      sheet={current}
                      assets={state.assets}
                      brand={state.brand}
                      onDirty={D}
                      onError={E}
                      onSaved={(s) =>
                        S((st: any) => ({
                          ...st,
                          sheets: st.sheets.map((v: Sheet) =>
                            v.id === s.id ? s : v,
                          ),
                        }))
                      }
                      onUpload={refresh}
                      onDuplicate={() =>
                        void action(async () => {
                          const s = await api("/sheets", {
                            content: current.content,
                            derivedFrom: current.id,
                          });
                          await refresh();
                          A(s.id);
                        })
                      }
                    />
                  </fieldset>
                ) : (
                  <div className="empty editor-empty">
                    <span>✳</span>
                    <h2>給想法一個形狀</h2>
                    <p>
                      選擇一張 Sheet 開始編輯。
                      <br />
                      文字、素材與平台預覽，都在這裡。
                    </p>
                  </div>
                )}
              </section>
              <aside className="chat">
                <div className="chat-heading">
                  <span>✳</span>
                  <div>
                    Creative partner<small>DeepSeek · 多篇協作</small>
                  </div>
                  <span
                    className={
                      "dot " + (!state.deepseek.configured ? "off" : "")
                    }
                  />
                </div>
                <div className="chat-messages">
                  {state.brand && (
                    <details className="context-preview">
                      <summary>已帶入品牌 context</summary>
                      <pre>{state.brand}</pre>
                    </details>
                  )}
                  {!state.messages.length && (
                    <div className="chat-welcome">
                      <span>✳</span>
                      <h3>
                        下一個好想法，
                        <br />
                        從對話開始。
                      </h3>
                      <p>
                        我可以建立多篇草稿、調整語氣，或衍生不同平台的內容。
                      </p>
                      <button
                        className="prompt"
                        onClick={() =>
                          C("根據品牌 context，建立三篇不同角度的 X 宣傳草稿。")
                        }
                      >
                        為品牌構思三篇 X 草稿 ↗
                      </button>
                    </div>
                  )}
                  {state.messages.map((m: any, i: number) => (
                    <div className={"message " + m.role} key={i}>
                      <small>{m.role === "user" ? "你" : "PROMO AI"}</small>
                      <p>{m.content}</p>
                    </div>
                  ))}
                  {busy && <p className="muted">✳ 正在構思並更新草稿…</p>}
                </div>
                <form
                  className="chat-compose"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = chat;
                    C("");
                    void action(async () => {
                      B(true);
                      try {
                        await api("/chat", {
                          message:
                            text +
                            (active ? `\n目前選中的 Sheet ID：${active}` : ""),
                        });
                      } finally {
                        await refresh();
                        Epoch((v) => v + 1);
                        B(false);
                      }
                    });
                  }}
                >
                  <small>
                    {active
                      ? "已選取 Sheet，可直接要求修改"
                      : "可以一次建立多張 Sheet"}
                  </small>
                  <textarea
                    aria-label="AI 需求"
                    value={chat}
                    onChange={(e) => C(e.target.value)}
                    placeholder={
                      state.deepseek.configured
                        ? "說說你的想法…"
                        : "先到「品牌與連接」加入 DeepSeek Key"
                    }
                  />
                  <div>
                    <small>草稿可修改 · 發佈需確認</small>
                    <button
                      disabled={
                        busy ||
                        dirty ||
                        !state.deepseek.configured ||
                        !chat.trim()
                      }
                    >
                      ↑
                    </button>
                  </div>
                </form>
              </aside>
            </div>
          </>
        )}
        {page === "posts" && (
          <section className="panel">
            <div className="section-title">
              PUBLISHING QUEUE{" "}
              <button className="link" onClick={() => void refresh()}>
                刷新
              </button>
            </div>
            {!state.jobs.length ? (
              <div className="empty">
                <h3>尚未提交任何帖子</h3>
                <p>Review 提交後，這裡會顯示每个平台的獨立結果。</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>內容 / 平台</th>
                      <th>排程</th>
                      <th>狀態</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.jobs.map((j: any) => (
                      <tr key={j.id}>
                        <td>
                          <strong>{j.snapshot.title || "未命名"}</strong>
                          <small>
                            {names[j.platform]} · v{j.revision}
                          </small>
                        </td>
                        <td>{new Date(j.scheduled_at).toLocaleString()}</td>
                        <td>
                          <span className={"status " + j.status}>
                            {names[j.status]}
                          </span>
                          {j.status === "succeeded" && (
                            <small>公開可見性請開啟帖子核對</small>
                          )}
                          {j.error && (
                            <small className="error">{j.error}</small>
                          )}
                          {j.sync_error && <small>同步：{j.sync_error}</small>}
                        </td>
                        <td>
                          <div className="row-actions">
                            {j.url && (
                              <a href={j.url} target="_blank" rel="noreferrer">
                                查看帖子 ↗
                              </a>
                            )}
                            {j.status === "succeeded" && (
                              <button
                                className="link"
                                onClick={() =>
                                  void action(async () => {
                                    await api(`/jobs/${j.id}/sync`, {});
                                    await refresh();
                                  })
                                }
                              >
                                同步數據
                              </button>
                            )}
                            {j.status === "queued" && (
                              <button
                                className="link"
                                onClick={() =>
                                  void action(async () => {
                                    await api(`/jobs/${j.id}/cancel`, {});
                                    await refresh();
                                  })
                                }
                              >
                                取消
                              </button>
                            )}
                            {["failed", "needs_attention"].includes(
                              j.status,
                            ) && (
                              <>
                                <button
                                  className="link"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "已查看平台並確認沒有發佈？確認後會重新發送。",
                                      )
                                    )
                                      void action(async () => {
                                        await api(`/jobs/${j.id}/retry`, {
                                          confirmedNotPublished: true,
                                        });
                                        await refresh();
                                      });
                                  }}
                                >
                                  確認未發佈後重試
                                </button>
                                <button
                                  className="link"
                                  onClick={() => {
                                    const postId =
                                      prompt("輸入已發佈的帖子 ID");
                                    if (postId)
                                      void action(async () => {
                                        await api(`/jobs/${j.id}/reconcile`, {
                                          postId,
                                        });
                                        await refresh();
                                      });
                                  }}
                                >
                                  登記已發佈 ID
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {page === "dashboard" && (
          <>
            <div className="stat-grid">
              {[
                ["草稿 Sheets", state.sheets.length],
                [
                  "API 已接受",
                  state.jobs.filter((j: any) => j.status === "succeeded")
                    .length,
                ],
                [
                  "等待分發",
                  state.jobs.filter((j: any) => j.status === "queued").length,
                ],
                [
                  "需要處理",
                  state.jobs.filter((j: any) =>
                    ["failed", "needs_attention"].includes(j.status),
                  ).length,
                ],
              ].map(([l, n]) => (
                <div className="stat" key={l}>
                  <small>{l}</small>
                  <strong>{n}</strong>
                </div>
              ))}
            </div>
            <section className="panel">
              <div className="section-title">
                POST PERFORMANCE{" "}
                <button className="link" onClick={() => void refresh()}>
                  刷新
                </button>
              </div>
              <p className="muted">
                每 6 小時嘗試同步；— 表示未取得。Facebook 觀看數尚未接入，X
                曝光不代表獨立觀看人數。Threads／Instagram 顯示平台回傳觀看數；指標定義不同，不宜直接相加。
              </p>
              {!state.jobs.some((j: any) => j.status === "succeeded") ? (
                <div className="empty">
                  <h3>等待第一篇真實帖子</h3>
                  <p>完成發佈後，這裡會顯示平台回傳的數據。</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>帖子</th>
                      <th>曝光 / 觀看</th>
                      <th>按讚 / 反應</th>
                      <th>回覆 / 留言</th>
                      <th>轉發 / 分享</th>
                      <th>取得時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.jobs
                      .filter((j: any) => j.status === "succeeded")
                      .map((j: any) => {
                        const m = latest.get(j.id),
                          v = m?.values_json || {};
                        return (
                          <tr key={j.id}>
                            <td>
                              {j.snapshot.title}
                              <small>{names[j.platform]}</small>
                            </td>
                            <td>{v.impression_count ?? v.views ?? "—"}</td>
                            <td>{v.like_count ?? v.reactions ?? "—"}</td>
                            <td>{v.reply_count ?? v.comments ?? "—"}</td>
                            <td>{v.retweet_count ?? v.shares ?? "—"}</td>
                            <td>
                              {m
                                ? new Date(m.fetched_at).toLocaleString()
                                : "尚未同步"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
        {page === "settings" && (
          <Settings state={state} refresh={refresh} onError={E} />
        )}
      </main>
      {review && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="人工確認分發"
          >
            <span className="eyebrow">HUMAN REVIEW</span>
            <h2>確認 {review.length} 張內容的分發</h2>
            <p>確認後建立內容快照，按預定時間透過 API 發送。</p>
            {!state.publicMediaConfigured && review.some(s => s.content.assetIds.length && s.content.platforms.some((p: string) => ["threads", "instagram"].includes(p))) && <p role="alert" className="error">Threads／Instagram 媒體尚無公開 HTTPS 入口；請先設定 MEDIA_PUBLIC_BASE_URL。</p>}
            <div className="review-list">
              {review.map((s) => (
                <article key={s.id}>
                  <h3>{s.content.title || "未命名"}</h3>
                  <pre>{postText(s.content)}</pre>
                  <Media ids={s.content.assetIds} assets={state.assets} />
                  {validatePublish(
                    s.content,
                    state.assets.filter((a: any) => s.content.assetIds.includes(a.id)),
                  ).map((message) => (
                    <p className="error" key={message}>{message}</p>
                  ))}
                  <small>
                    {s.content.platforms
                      .map(
                        (p: string) =>
                          `${names[p]} · ${state.accounts.find((a: any) => a.platform === p)?.name || "未連接"}`,
                      )
                      .join(" / ")}
                    <br />
                    {s.content.scheduledAt
                      ? new Date(s.content.scheduledAt).toLocaleString()
                      : "立即分發"}{" "}
                    · v{s.revision}
                  </small>
                </article>
              ))}
            </div>
            {error && <p role="alert" className="error">{error}</p>}
            <div className="modal-actions">
              <button className="secondary" onClick={() => R(null)}>
                返回修改
              </button>
              <button
                disabled={
                  busy ||
                  review.some(
                    (s) =>
                      validatePublish(s.content, state.assets.filter((a: any) => s.content.assetIds.includes(a.id))).length > 0 ||
                      !s.content.platforms.length ||
                      s.content.platforms.some(
                        (p: string) =>
                          !state.accounts.some((a: any) => a.platform === p),
                      ),
                  )
                }
                onClick={() =>
                  void action(async () => {
                    B(true);
                    try {
                      await api("/approve", {
                        confirmed: true,
                        items: review.map((s) => ({
                          id: s.id,
                          revision: s.revision,
                        })),
                      });
                      R(null);
                      Select([]);
                      V("posts");
                      await refresh();
                    } finally {
                      B(false);
                    }
                  })
                }
              >
                {busy ? "正在提交…" : "我已 review，確認分發"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
