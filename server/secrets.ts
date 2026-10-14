import { randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("data", { recursive: true });
let key = process.env.ENCRYPTION_KEY;
if (!key) {
  try {
    key = await readFile("data/key", "utf8");
  } catch {
    key = randomBytes(32).toString("hex");
    await writeFile("data/key", key, { mode: 0o600 });
  }
}
if (!/^[a-f0-9]{64}$/i.test(key))
  throw Error("ENCRYPTION_KEY must be 64 hex characters");
const secret = Buffer.from(key, "hex");
export function mediaSignature(id: string, expires: string) {
  return createHmac("sha256", secret).update(`media:${id}:${expires}`).digest("hex");
}
export function validMediaSignature(id: string, expires: string, signature: string) {
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now() || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mediaSignature(id, expires), "hex"));
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret, iv);
  const body = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}
export function decrypt(value: string) {
  const [iv, tag, body] = value.split(".").map((v) => Buffer.from(v, "base64"));
  const d = createDecipheriv("aes-256-gcm", secret, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
