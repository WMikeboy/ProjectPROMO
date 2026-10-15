import "dotenv/config";
import express from "express";
import multer from "multer";
import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { init, query, setting, saveSetting, serial, closeDatabase } from "./db.js";
import { encrypt, validMediaSignature } from "./secrets.js";
import { createSheet, updateSheet, approve, empty } from "./store.js";
import { sheetSchema } from "../shared/model.js";
import { verifyAccount } from "./platforms.js";
import { runAgent } from "./agent.js";
import { tick, syncJob, accountFor } from "./worker.js";
import { registerOAuthCallback, startXOAuth } from "./oauth.js";
await init();
await mkdir("data/uploads", { recursive: true });
const app = express();
const port = Number(process.env.PORT || 4100);
const sessions = new Map<string, number>();
const password =
  process.env.ADMIN_PASSWORD || randomBytes(18).toString("base64url");
if (!process.env.ADMIN_PASSWORD)
  console.log(`Local access password: ${password}`);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        process.env.APP_ORIGIN,
      ]
        .filter(Boolean)
        .includes(origin)
    )
      return res.status(403).json({ error: "來源不允許" });
  }
  next();
});
let failures = 0;
let reset = Date.now();
app.post("/api/login", (req, res) => {
  if (Date.now() - reset > 60000) {
    failures = 0;
    reset = Date.now();
  }
  if (failures >= 10) return res.status(429).json({ error: "稍後再試" });
  const supplied = String(req.body.password || "");
  if (
    !timingSafeEqual(
      createHash("sha256").update(supplied).digest(),
      createHash("sha256").update(password).digest(),
    )
  ) {
    failures++;
    return res.status(401).json({ error: "密碼不正確" });
  }
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 12 * 3600000);
  res.setHeader(
    "Set-Cookie",
    `promo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
  );
  res.json({ ok: true });
});
registerOAuthCallback(app);
app.get("/media/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!validMediaSignature(id, String(req.query.expires || ""), String(req.query.signature || ""))) return res.sendStatus(403);
  const a = (await query("SELECT * FROM assets WHERE id=$1", [id])).rows[0];
  if (!a) return res.sendStatus(404);
  res.type(a.mime).sendFile(a.path);
});
app.use("/api", (req, res, next) => {
  const token =
    req.headers.cookie?.match(/(?:^|; )promo_session=([a-f0-9]+)/)?.[1] || "";
  if ((sessions.get(token) || 0) < Date.now())
    return res.status(401).json({ error: "請登入" });
  next();
});
app.get("/api/oauth/x/start", (_req, res) => res.redirect(startXOAuth(res)));
app.post("/api/logout", (req, res) => {
  const token = req.headers.cookie?.match(/promo_session=([a-f0-9]+)/)?.[1];
  if (token) sessions.delete(token);
  res.setHeader(
    "Set-Cookie",
    "promo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  res.json({ ok: true });
});
app.get("/api/state", async (req, res) => {
  const accounts = [];
  for (const p of ["x", "facebook", "threads", "instagram"]) {
    const a = await setting("account:" + p);
    if (a) accounts.push({ platform: p, id: a.id, name: a.name,
      tokenStoredAt: a.tokenStoredAt || null,
      connectionTest: await setting("account-test:" + p) || a.connectionTest || null,
    });
  }
  res.json({
    sheets: (await query("SELECT * FROM sheets ORDER BY updated_at DESC")).rows,
    assets: (
      await query(
        "SELECT id,name,mime,size FROM assets ORDER BY created_at DESC",
      )
    ).rows,
    jobs: (await query("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200"))
      .rows,
    metrics: (
      await query("SELECT * FROM metrics ORDER BY fetched_at DESC LIMIT 1000")
    ).rows,
    messages: (
      await query(
        "SELECT role,content FROM (SELECT * FROM messages ORDER BY created_at DESC LIMIT 200) recent ORDER BY created_at",
      )
    ).rows,
    accounts,
    brand: (await setting("brand")) || "",
    deepseek: {
      configured: !!(
        (await setting("deepseek"))?.key || process.env.DEEPSEEK_API_KEY
      ),
      model:
        (await setting("deepseek"))?.model ||
        process.env.DEEPSEEK_MODEL ||
        "deepseek-flash",
    },
    oauthX: !!process.env.X_CLIENT_ID,
    publicMediaConfigured: !!process.env.MEDIA_PUBLIC_BASE_URL?.startsWith("https://"),
    mode: process.env.DATABASE_URL
      ? "PostgreSQL"
      : "Embedded PostgreSQL · local pilot",
  });
});
app.post("/api/sheets", async (req, res) =>
  res.json(
    await createSheet(
      req.body.content ? sheetSchema.parse(req.body.content) : empty,
      req.body.derivedFrom
        ? z.string().uuid().parse(req.body.derivedFrom)
        : null,
    ),
  ),
);
app.put("/api/sheets/:id", async (req, res) =>
  res.json(
    await serial(() =>
      updateSheet(
        String(req.params.id),
        z.number().int().parse(req.body.revision),
        sheetSchema.parse(req.body.content),
      ),
    ),
  ),
);
app.post("/api/sheets/:id/undo", async (req, res) => {
  const id = String(req.params.id);
  res.json(
    await serial(async () => {
      const s = (await query("SELECT * FROM sheets WHERE id=$1", [id])).rows[0];
      const change = (
        await query(
          "SELECT * FROM changes WHERE sheet_id=$1 ORDER BY created_at DESC LIMIT 1",
          [id],
        )
      ).rows[0];
      if (
        !s ||
        !change ||
        s.revision !== req.body.revision ||
        change.after_revision !== s.revision
      )
        throw Error("無可撤銷變更或版本已改");
      return updateSheet(id, s.revision, change.before_json);
    }),
  );
});
app.post("/api/approve", async (req, res) => {
  if (req.body.confirmed !== true) throw Error("需要人工確認");
  const items = z
    .array(z.object({ id: z.string().uuid(), revision: z.number().int() }))
    .parse(req.body.items);
  res.json(await serial(() => approve(items)));
});
app.post("/api/jobs/:id/cancel", async (req, res) => {
  await query(
    "UPDATE jobs SET status='cancelled' WHERE id=$1 AND status='queued'",
    [req.params.id],
  );
  res.json({ ok: true });
});
app.post("/api/jobs/:id/retry", async (req, res) => {
  if (req.body.confirmedNotPublished !== true)
    throw Error("請先確認平台未發佈");
  await query(
    "UPDATE jobs SET status='queued',error=NULL,scheduled_at=now() WHERE id=$1 AND status IN ('failed','needs_attention')",
    [req.params.id],
  );
  res.json({ ok: true });
});
app.post("/api/jobs/:id/reconcile", async (req, res) => {
  const v = z.object({ postId: z.string().regex(/^[0-9_]+$/) }).parse(req.body);
  const job = (await query("SELECT * FROM jobs WHERE id=$1", [req.params.id]))
    .rows[0];
  if (!job || !["failed", "needs_attention"].includes(job.status))
    throw Error("此工作不需核對");
  const url =
    job.platform === "x"
      ? `https://x.com/i/status/${v.postId}`
      : job.platform === "facebook" ? `https://www.facebook.com/${v.postId}` : null;
  await query(
    "UPDATE jobs SET status='succeeded',post_id=$1,url=$2,error=NULL WHERE id=$3",
    [v.postId, url, job.id],
  );
  res.json({ ok: true });
});
app.post("/api/jobs/:id/sync", async (req, res) =>
  res.json(await syncJob(String(req.params.id))),
);
app.put("/api/brand", async (req, res) => {
  await saveSetting("brand", z.string().max(16000).parse(req.body.context));
  res.json({ ok: true });
});
app.put("/api/deepseek", async (req, res) => {
  const v = z
    .object({
      key: z.string().max(500).optional(),
      model: z.string().min(1).max(100),
    })
    .parse(req.body);
  const old = await setting("deepseek");
  await saveSetting("deepseek", {
    model: v.model,
    key: v.key ? encrypt(v.key) : old?.key,
  });
  res.json({ ok: true });
});
app.post("/api/accounts", async (req, res) => {
  const v = z
    .object({
      platform: z.enum(["x", "facebook", "threads", "instagram"]),
      token: z.string().min(10).max(4000),
      pageId: z.string().optional(),
    })
    .parse(req.body);
  const a = await verifyAccount(v.platform, v.token, v.pageId);
  const now = new Date().toISOString();
  await saveSetting("account:" + v.platform, { ...a, token: encrypt(a.token), tokenStoredAt: now });
  await saveSetting("account-test:" + v.platform, { testedAt: now, ok: true, message: "身分驗證成功；未測試實際發佈權限或素材入口" });
  res.json({ name: a.name, id: a.id });
});
app.post("/api/accounts/:platform/test", async (req, res) => {
  const platform = z.enum(["x", "facebook", "threads", "instagram"]).parse(req.params.platform);
  const original = await setting("account:" + platform);
  if (!original) return res.status(400).json({ error: "帳號尚未連接" });
  let result;
  try {
    const account = await accountFor(platform);
    const verified = await verifyAccount(platform, account.token, account.id);
    if (verified.id !== original.id) throw Error("帳號身分不符，請重新連接");
    result = { testedAt: new Date().toISOString(), ok: true, message: "身分驗證成功；未測試實際發佈權限或素材入口" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "連接測試失敗";
    result = { testedAt: new Date().toISOString(), ok: false, message };
  }
  const current = await setting("account:" + platform);
  if (current.tokenStoredAt !== original.tokenStoredAt || current.id !== original.id)
    return res.status(409).json({ error: "測試期間連接已更新，請重新測試" });
  await saveSetting("account-test:" + platform, result);
  res.json(result);
});
let agentBusy = false;
app.post("/api/chat", async (req, res) => {
  if (agentBusy)
    return res.status(409).json({ error: "Agent 正在處理上一個需求" });
  const prompt = z.string().min(1).max(8000).parse(req.body.message);
  agentBusy = true;
  try {
    res.json(await runAgent(prompt));
  } finally {
    agentBusy = false;
  }
});
const upload = multer({
  dest: "data/uploads",
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    cb(
      null,
      [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
      ].includes(file.mimetype),
    ),
});
app.post("/api/assets", upload.single("file"), async (req, res) => {
  const f = req.file;
  if (!f) throw Error("支援 JPG、PNG、WEBP、GIF、MP4；單檔最多 100 MB");
  const bytes = await readFile(f.path);
  const ok =
    (f.mimetype === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) ||
    (f.mimetype === "image/png" && bytes.subarray(1, 4).toString() === "PNG") ||
    (f.mimetype === "image/gif" && bytes.subarray(0, 3).toString() === "GIF") ||
    (f.mimetype === "image/webp" &&
      bytes.subarray(8, 12).toString() === "WEBP") ||
    (f.mimetype === "video/mp4" && bytes.subarray(4, 8).toString() === "ftyp");
  if (!ok) {
    await unlink(f.path);
    throw Error("檔案內容與格式不符");
  }
  const id = randomUUID();
  await query(
    "INSERT INTO assets(id,name,mime,size,path) VALUES($1,$2,$3,$4,$5)",
    [id, f.originalname, f.mimetype, f.size, path.resolve(f.path)],
  );
  res.json({ id });
});
app.get("/api/assets/:id", async (req, res) => {
  const a = (await query("SELECT * FROM assets WHERE id=$1", [req.params.id]))
    .rows[0];
  if (!a) return res.sendStatus(404);
  res.type(a.mime);
  res.sendFile(a.path);
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API 路由不存在，請確認前後端版本一致並重新啟動後端" });
});
app.use(express.static("dist"));
app.use((err: any, _req: any, res: any, _next: any) => {
  res
    .status(400)
    .json({
      error:
        err instanceof z.ZodError
          ? "輸入格式不正確"
          : err.message || "操作失敗",
    });
});
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`PROMO server http://127.0.0.1:${port}`),
);
const timer = setInterval(() => void tick(), 5000);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(timer);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  });
}
