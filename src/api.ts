export async function api(
  url: string,
  body?: any,
  method = body ? "POST" : "GET",
) {
  const r = await fetch("/api" + url, {
    method,
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  if (r.status === 401) throw Error("LOGIN");
  const raw = await r.text();
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    throw Error(`API 回傳非 JSON（HTTP ${r.status}）。請重新啟動後端並重新整理頁面；若仍失敗，請檢查 API 代理設定。`);
  }
  if (!r.ok) throw Error(d?.error || `操作失敗（HTTP ${r.status}）`);
  return d;
}
export const names: Record<string, string> = {
  x: "X",
  facebook: "Facebook Page",
  threads: "Threads",
  instagram: "Instagram",
  queued: "等待分發",
  running: "發佈中",
  succeeded: "API 已接受",
  failed: "失敗",
  needs_attention: "需要核對",
  cancelled: "已取消",
};
