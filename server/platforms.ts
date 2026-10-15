import { readFile } from "node:fs/promises";
import { postText, type Content } from "../shared/model.js";
import { mediaSignature } from "./secrets.js";
export type Account = {
  id: string;
  name: string;
  token: string;
  platform: "x" | "facebook" | "threads" | "instagram";
};
export class RemoteError extends Error {
  constructor(
    message: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export async function remote(
  url: string,
  token: string,
  init: RequestInit = {},
  publishing = false,
) {
  let r: Response;
  try {
    r = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw new RemoteError("平台連線逾時／中斷，請核對結果", publishing);
  }
  const raw = await r.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new RemoteError("平台回傳無法解析，請核對結果", publishing);
  }
  if (!r.ok || data.error)
    throw new RemoteError(
      `平台請求失敗（HTTP ${r.status}，代碼 ${data.error?.code ?? data.status ?? "unknown"}）${Number(data.error?.code) === 190 ? "：Token 已過期或失效，請重新授權並更新 Token" : ""}`,
      publishing && r.status >= 500,
    );
  return data;
}
const graph = () =>
  `https://graph.facebook.com/${process.env.FACEBOOK_GRAPH_VERSION || "v26.0"}`;
export async function verifyAccount(
  platform: Account["platform"],
  token: string,
  pageId?: string,
): Promise<Account> {
  if (platform === "threads" || platform === "instagram") {
    const r = await remote(`${metaBase(platform)}/me?fields=${platform === "instagram" ? "user_id,username" : "id,username"}`, token);
    const id = r.user_id || r.id;
    if (!id || !r.username) throw Error("未取得帳號身分，請使用對應平台的 User Token");
    return { id: String(id), name: r.username, token, platform };
  }
  if (platform === "x") {
    const r = await remote("https://api.x.com/2/users/me", token);
    if (!r.data?.id) throw Error("X token 缺少用戶授權");
    return { id: r.data.id, name: r.data.name, token, platform };
  }
  if (!pageId || !/^\d+$/.test(pageId)) throw Error("請填寫 Page ID");
  const r = await remote(`${graph()}/me?fields=id,name`, token);
  if (r.id !== pageId) throw Error("請使用對應 Page 的 Page Access Token");
  return { id: r.id, name: r.name, token, platform };
}
async function uploadX(a: any, token: string) {
  const bytes = await readFile(a.path);
  const category = a.mime.startsWith("video/")
    ? "tweet_video"
    : a.mime === "image/gif"
      ? "tweet_gif"
      : "tweet_image";
  const r = await remote("https://api.x.com/2/media/upload/initialize", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: a.mime,
      total_bytes: bytes.length,
      media_category: category,
    }),
  });
  const id = r.data?.id;
  if (!id) throw Error("X 未回傳 media ID");
  for (
    let offset = 0, index = 0;
    offset < bytes.length;
    offset += 4 * 1024 * 1024, index++
  ) {
    const f = new FormData();
    f.set("segment_index", String(index));
    f.set(
      "media",
      new Blob(
        [new Uint8Array(bytes.subarray(offset, offset + 4 * 1024 * 1024))],
        { type: a.mime },
      ),
      a.name,
    );
    await remote(`https://api.x.com/2/media/upload/${id}/append`, token, {
      method: "POST",
      body: f,
    });
  }
  let result = await remote(
    `https://api.x.com/2/media/upload/${id}/finalize`,
    token,
    { method: "POST" },
  );
  for (
    let n = 0;
    result.data?.processing_info &&
    result.data.processing_info.state !== "succeeded";
    n++
  ) {
    if (n >= 30 || result.data.processing_info.state === "failed")
      throw Error("X 素材處理未完成，尚未建立帖子");
    await new Promise((r) =>
      setTimeout(
        r,
        Math.min(
          10,
          Math.max(1, result.data.processing_info.check_after_secs || 2),
        ) * 1000,
      ),
    );
    result = await remote(
      `https://api.x.com/2/media/upload?command=STATUS&media_id=${encodeURIComponent(id)}`,
      token,
    );
  }
  return id;
}
export async function publish(account: Account, c: Content, assets: any[]) {
  if (account.platform === "threads" || account.platform === "instagram") return publishMeta(account, c, assets);
  const text = postText(c);
  if (account.platform === "x") {
    const ids = [];
    for (const a of assets) ids.push(await uploadX(a, account.token));
    const r = await remote(
      "https://api.x.com/2/tweets",
      account.token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          ...(ids.length ? { media: { media_ids: ids } } : {}),
        }),
      },
      true,
    );
    if (!r.data?.id)
      throw new RemoteError("未取得 X 帖子 ID，請人工核對", true);
    return { id: r.data.id, url: `https://x.com/i/status/${r.data.id}` };
  }
  const video = assets.find((a) => a.mime.startsWith("video/"));
  if (video) {
    const f = new FormData();
    f.set("description", text);
    f.set(
      "source",
      new Blob([new Uint8Array(await readFile(video.path))], {
        type: video.mime,
      }),
      video.name,
    );
    const r = await remote(
      `${graph()}/${account.id}/videos`,
      account.token,
      { method: "POST", body: f },
      true,
    );
    if (!r.id) throw new RemoteError("未取得 Facebook 影片 ID", true);
    return { id: r.id, url: `https://www.facebook.com/${r.id}` };
  }
  const media = [];
  for (const a of assets) {
    const f = new FormData();
    f.set("published", "false");
    f.set(
      "source",
      new Blob([new Uint8Array(await readFile(a.path))], { type: a.mime }),
      a.name,
    );
    const r = await remote(`${graph()}/${account.id}/photos`, account.token, {
      method: "POST",
      body: f,
    });
    if (!r.id) throw Error("未取得 FB 素材 ID");
    media.push({ media_fbid: r.id });
  }
  const body = new URLSearchParams({ message: text });
  if (media.length) body.set("attached_media", JSON.stringify(media));
  const r = await remote(
    `${graph()}/${account.id}/feed`,
    account.token,
    { method: "POST", body },
    true,
  );
  if (!r.id) throw new RemoteError("未取得 Facebook 帖子 ID", true);
  return { id: r.id, url: `https://www.facebook.com/${r.id}` };
}
export async function fetchMetrics(account: Account, id: string) {
  if (account.platform === "threads" || account.platform === "instagram") {
    const isThreads = account.platform === "threads";
    const r = await remote(`${metaBase(account.platform)}/${encodeURIComponent(id)}/insights?metric=${isThreads ? "views,likes,replies,reposts,quotes" : "views,likes,comments,shares"}`, account.token);
    const values: Record<string, number | null> = {};
    for (const metric of r.data || []) values[metric.name] = metric.values?.[0]?.value ?? metric.total_value?.value ?? null;
    return { views: values.views ?? null, like_count: values.likes ?? null, reply_count: values[isThreads ? "replies" : "comments"] ?? null, shares: values[isThreads ? "reposts" : "shares"] ?? null, quotes: values.quotes ?? null };
  }
  if (account.platform === "x") {
    const r = await remote(
      `https://api.x.com/2/tweets/${encodeURIComponent(id)}?tweet.fields=public_metrics`,
      account.token,
    );
    if (!r.data?.public_metrics) throw Error("X 指標不可用");
    return r.data.public_metrics;
  }
  const r = await remote(
    `${graph()}/${encodeURIComponent(id)}?fields=reactions.limit(0).summary(true),comments.limit(0).summary(true),shares`,
    account.token,
  );
  return {
    reactions: r.reactions?.summary?.total_count ?? null,
    comments: r.comments?.summary?.total_count ?? null,
    shares: r.shares?.count ?? null,
    views: null,
  };
}
function metaBase(platform: string) {
  return platform === "threads" ? "https://graph.threads.net/v1.0" : `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_VERSION || "v26.0"}`;
}
export function publicMediaURL(id: string) {
  const base = process.env.MEDIA_PUBLIC_BASE_URL;
  if (!base || !base.startsWith("https://")) throw Error("Threads／Instagram 素材需要公開 HTTPS 網址，請設定 MEDIA_PUBLIC_BASE_URL 指向此服務");
  const expires = String(Date.now() + 24 * 3600000);
  return `${base.replace(/\/$/, "")}/media/${encodeURIComponent(id)}?expires=${expires}&signature=${mediaSignature(id, expires)}`;
}
async function publishMeta(account: Account, c: Content, assets: any[]) {
  const threads = account.platform === "threads";
  const base = metaBase(account.platform);
  const edge = threads ? "threads" : "media";
  const textField = threads ? "text" : "caption";
  async function create(params: Record<string, string>) {
    const r = await remote(`${base}/${account.id}/${edge}`, account.token, { method: "POST", body: new URLSearchParams(params) });
    if (!r.id) throw Error("平台未回傳素材容器 ID");
    return String(r.id);
  }
  async function ready(id: string) {
    const field = threads ? "status" : "status_code";
    for (let i = 0; i < 6; i++) {
      const r = await remote(`${base}/${id}?fields=${field}`, account.token);
      if (r[field] === "FINISHED") return;
      if (["ERROR", "EXPIRED"].includes(r[field])) throw Error("平台素材處理失敗，尚未發佈");
      if (i < 5) await new Promise(resolve => setTimeout(resolve, 60000));
    }
    throw Error("平台素材處理逾時，尚未發佈");
  }
  const urls = assets.map(a => publicMediaURL(a.id));
  const children: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    const video = assets[i].mime.startsWith("video/");
    const params: Record<string, string> = { [video ? "video_url" : "image_url"]: urls[i] };
    if (threads || video) params.media_type = video ? (threads ? "VIDEO" : "REELS") : "IMAGE";
    if (assets.length > 1) params.is_carousel_item = "true";
    else params[textField] = postText(c);
    const id = await create(params);
    await ready(id);
    children.push(id);
  }
  let container = children[0];
  if (!assets.length) {
    if (!threads) throw Error("Instagram 需要圖片或影片");
    container = await create({ media_type: "TEXT", text: postText(c) });
    await ready(container);
  } else if (children.length > 1) {
    container = await create({ media_type: "CAROUSEL", children: children.join(","), [textField]: postText(c) });
    await ready(container);
  }
  const r = await remote(`${base}/${account.id}/${edge}_publish`, account.token, { method: "POST", body: new URLSearchParams({ creation_id: container }) }, true);
  if (!r.id) throw new RemoteError("平台未回傳帖子 ID，請人工核對", true);
  // Publication has succeeded. A permalink lookup failure must not trigger republishing.
  let url: string | null = null;
  try { url = (await remote(`${base}/${r.id}?fields=permalink`, account.token)).permalink || null; } catch {}
  return { id: String(r.id), url };
}
