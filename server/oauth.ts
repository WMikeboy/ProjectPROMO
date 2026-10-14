import { randomBytes, createHash } from "node:crypto";
import type { Response, Express } from "express";
import { saveSetting, setting } from "./db.js";
import { encrypt, decrypt } from "./secrets.js";
import { verifyAccount } from "./platforms.js";
const pending = new Map<string, { verifier: string; expires: number; browser: string }>();
export function registerOAuthCallback(app: Express) {
  app.get("/oauth/x/callback", async (req, res) => {
    const state = String(req.query.state || "");
    const flow = pending.get(state);
    pending.delete(state);
    const browser = req.headers.cookie?.match(/(?:^|; )promo_oauth=([a-f0-9]+)/)?.[1];
    if (!flow || flow.expires < Date.now() || !browser || browser !== flow.browser)
      return res.status(400).send("OAuth state 已過期，請重新連接");
    try {
      if (req.query.error) throw Error("X 授權已取消");
      const code = String(req.query.code || "");
      if (!code) throw Error("缺少授權碼");
      const data = await exchange({
        grant_type: "authorization_code",
        code,
        code_verifier: flow.verifier,
        redirect_uri: redirectURI(),
      });
      const a = await verifyAccount("x", data.access_token);
      await saveSetting("account:x", {
        ...a,
        token: encrypt(a.token),
        refreshToken: data.refresh_token ? encrypt(data.refresh_token) : null,
        expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
      });
      res.redirect("/");
    } catch {
      res
        .status(400)
        .send(
          "X OAuth 連接失敗。請檢查 App callback URL、scope 與金鑰後重試。",
        );
    }
  });
}
export function startXOAuth(res: Response) {
  if (!process.env.X_CLIENT_ID)
    throw Error("請先在 .env 設定 X_CLIENT_ID 與 X_REDIRECT_URI");
  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
  const state = randomBytes(24).toString("hex"),
    verifier = randomBytes(32).toString("base64url");
  const browser = randomBytes(32).toString("hex");
  res.cookie("promo_oauth", browser, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/oauth/x/callback", maxAge: 600000 });
  pending.set(state, { verifier, expires: Date.now() + 600000, browser });
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: redirectURI(),
    scope: "tweet.read tweet.write users.read media.write offline.access",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return "https://x.com/i/oauth2/authorize?" + q;
}
function redirectURI() {
  return (
    process.env.X_REDIRECT_URI ||
    `http://127.0.0.1:${process.env.PORT || 4100}/oauth/x/callback`
  );
}
async function exchange(body: Record<string, string>) {
  const id = process.env.X_CLIENT_ID;
  if (!id) throw Error("缺少 X_CLIENT_ID");
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (process.env.X_CLIENT_SECRET)
    headers.Authorization =
      "Basic " +
      Buffer.from(id + ":" + process.env.X_CLIENT_SECRET).toString("base64");
  const r = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body: new URLSearchParams({ ...body, client_id: id }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error("X token 交換失敗");
  const data: any = await r.json();
  if (!data.access_token) throw Error("未取得 access token");
  return data;
}
let refreshInFlight: Promise<any> | undefined;
export async function refreshedXAccount() {
  const a = await setting("account:x");
  if (!a) throw Error("X 未連接");
  if (!a.expiresAt || a.expiresAt > Date.now() + 60000) return a;
  if (!a.refreshToken) throw Error("X token 已過期，請重新連接");
  if (!refreshInFlight)
    refreshInFlight = (async () => {
      const data = await exchange({
        grant_type: "refresh_token",
        refresh_token: decrypt(a.refreshToken),
      });
      const next = {
        ...a,
        token: encrypt(data.access_token),
        refreshToken: data.refresh_token
          ? encrypt(data.refresh_token)
          : a.refreshToken,
        expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
      };
      await saveSetting("account:x", next);
      return next;
    })().finally(() => {
      refreshInFlight = undefined;
    });
  return refreshInFlight;
}
