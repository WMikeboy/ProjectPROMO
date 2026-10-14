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
  const d = await r.json();
  if (!r.ok) throw Error(r.status === 401 ? "LOGIN" : d.error || "操作失敗");
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
