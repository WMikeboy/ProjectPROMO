import { useEffect, useState, useRef } from "react";
import { type Sheet, type Content, postText } from "../shared/model";
import { api, names } from "./api";
export function Media({ ids, assets }: { ids: string[]; assets: any[] }) {
  return (
    <div className="media-grid">
      {ids.map((id) =>
        assets.find((a) => a.id === id)?.mime.startsWith("video/") ? (
          <video key={id} controls src={"/api/assets/" + id} />
        ) : (
          <img alt="發佈素材" key={id} src={"/api/assets/" + id} />
        ),
      )}
    </div>
  );
}
export default function Editor({
  sheet,
  assets,
  brand,
  onDirty,
  onSaved,
  onError,
  onUpload,
  onDuplicate,
}: {
  sheet: Sheet;
  assets: any[];
  brand: string;
  onDirty: (v: boolean) => void;
  onSaved: (s: Sheet) => void;
  onError: (v: string) => void;
  onUpload: () => Promise<any>;
  onDuplicate: () => void;
}) {
  const [c, C] = useState<Content>(sheet.content),
    [revision, Rev] = useState(sheet.revision),
    [saved, Saved] = useState("已儲存"),
    [preview, Preview] = useState(false),
    [tagsText, Tags] = useState(sheet.content.tags.join(", "));
  const last = useRef(JSON.stringify(sheet.content));
  const saving = useRef(false);
  const latest = useRef(c);
  latest.current = c;
  useEffect(() => {
    const changed = JSON.stringify(c) !== last.current;
    onDirty(changed);
    if (!changed) return;
    Saved("儲存中…");
    const timer = setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      const submitted = latest.current;
      try {
        const s = await api(
          "/sheets/" + sheet.id,
          { revision, content: submitted },
          "PUT",
        );
        last.current = JSON.stringify(submitted);
        Rev(s.revision);
        onSaved(s);
        Saved("已儲存");
        if (JSON.stringify(latest.current) === last.current) onDirty(false);
      } catch (e) {
        Saved("儲存失敗");
        onError((e as Error).message);
      } finally {
        saving.current = false;
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [c, revision]);
  const change = (patch: Partial<Content>) => C((v) => ({ ...v, ...patch }));
  const suggestion =
    !c.title && brand
      ? brand
          .split("\n")
          .find((l) => l.trim())
          ?.slice(0, 70) || ""
      : "";
  return (
    <>
      <div className="editor-toolbar">
        <span>
          <span className="dot" />
          {saved} · v{revision}
        </span>
        <button
          className="link"
          disabled={saved !== "已儲存"}
          onClick={onDuplicate}
        >
          複製
        </button>
        <button
          className="link"
          disabled={saved !== "已儲存"}
          onClick={() =>
            void api(`/sheets/${sheet.id}/undo`, { revision })
              .then((s) => {
                last.current = JSON.stringify(s.content);
                C(s.content);
                Tags(s.content.tags.join(", "));
                Rev(s.revision);
                onSaved(s);
              })
              .catch((e) => onError(e.message))
          }
        >
          撤銷
        </button>
      </div>
      <div className="editor-tabs">
        <button
          className={!preview ? "selected" : ""}
          onClick={() => Preview(false)}
        >
          編輯內容
        </button>
        <button
          className={preview ? "selected" : ""}
          onClick={() => Preview(true)}
        >
          平台預覽
        </button>
      </div>
      {preview ? (
        <div className="previews">
          {(c.platforms.length ? c.platforms : ["x", "facebook", "threads", "instagram"]).map((p) => (
            <article className="preview" key={p}>
              <small>{names[p]} · 效果示意</small>
              <div className="profile">
                <span className="avatar">P</span>
                <strong>Your brand</strong>
              </div>
              <pre>{postText(c) || "內容預覽"}</pre>
              <Media ids={c.assetIds} assets={assets} />
              <div className="preview-footer">♡　◯　↗</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="editor-fields">
          <label>
            標題 <small>會成為貼文第一段</small>
            <input
              value={c.title}
              placeholder={suggestion || "這篇內容的標題…"}
              onKeyDown={(e) => {
                if (e.key === "Tab" && suggestion) {
                  e.preventDefault();
                  change({ title: suggestion });
                }
              }}
              onChange={(e) => change({ title: e.target.value })}
            />
            {suggestion && <small>品牌預填建議 · Tab 接受</small>}
          </label>
          <label>
            內容
            <textarea
              rows={8}
              value={c.body}
              placeholder="把想說的寫下來，或交給右側的 AI 一起構思。"
              onChange={(e) => change({ body: e.target.value })}
            />
          </label>
          <label>
            Tags
            <input
              value={tagsText}
              placeholder="新品, 品牌故事"
              onChange={(e) => {
                Tags(e.target.value);
                change({
                  tags: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                });
              }}
            />
          </label>
          <label>
            分發平台
            <div className="platform-options">
              {["x", "facebook", "threads", "instagram"].map((p) => (
                <button
                  key={p}
                  className={
                    "secondary " +
                    (c.platforms.includes(p as any) ? "picked" : "")
                  }
                  onClick={() =>
                    change({
                      platforms: c.platforms.includes(p as any)
                        ? c.platforms.filter((v) => v !== p)
                        : [...c.platforms, p as any],
                    })
                  }
                >
                  {p === "x" ? "𝕏" : "f"}　{names[p]}
                </button>
              ))}
            </div>
          </label>
          <label>
            預定時間 <small>留空即確認後發送 · 本機時區</small>
            <input
              type="datetime-local"
              value={
                c.scheduledAt
                  ? new Date(
                      new Date(c.scheduledAt).getTime() -
                        new Date(c.scheduledAt).getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                change({
                  scheduledAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
          <div className="asset-header">
            <label>發佈素材</label>
            <label className="upload">
              ＋ 上傳
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const form = new FormData();
                  form.set("file", f);
                  try {
                    const a = await api("/assets", form);
                    await onUpload();
                    change({
                      assetIds: [...latest.current.assetIds, a.id].slice(0, 4),
                    });
                  } catch (e) {
                    onError((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
          <Media ids={c.assetIds} assets={assets} />
          {c.assetIds.map((id, i) => (
            <div className="asset-row" key={id}>
              <small>{assets.find((a) => a.id === id)?.name}</small>
              <button
                className="link"
                onClick={() =>
                  change({ assetIds: c.assetIds.filter((v) => v !== id) })
                }
              >
                移除
              </button>
              {i > 0 && (
                <button
                  className="link"
                  onClick={() => {
                    const ids = [...c.assetIds];
                    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                    change({ assetIds: ids });
                  }}
                >
                  往前
                </button>
              )}
            </div>
          ))}
          <p className="muted">圖片／影片人工加入。單檔上限 100 MB。</p>
          <select
            aria-label="加入已有素材"
            value=""
            onChange={(e) =>
              change({ assetIds: [...c.assetIds, e.target.value].slice(0, 4) })
            }
          >
            <option value="">從素材庫加入…</option>
            {assets
              .filter((a) => !c.assetIds.includes(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
      )}
    </>
  );
}
