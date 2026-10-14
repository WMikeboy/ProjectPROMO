import { randomUUID } from "node:crypto";
import { query, transaction, setting } from "./db.js";
import { sheetSchema, validatePublish, type Content } from "../shared/model.js";
export const empty: Content = {
  title: "",
  body: "",
  tags: [],
  platforms: [],
  assetIds: [],
  scheduledAt: null,
  location: "",
};
export async function createSheet(
  content: Content = empty,
  derivedFrom: string | null = null,
) {
  const id = randomUUID();
  return (
    await query(
      "INSERT INTO sheets(id,content,derived_from) VALUES($1,$2,$3) RETURNING *",
      [id, JSON.stringify(sheetSchema.parse(content)), derivedFrom],
    )
  ).rows[0];
}
export async function updateSheet(
  id: string,
  revision: number,
  content: Content,
) {
  return transaction(async (q) => {
    const old = (await q("SELECT * FROM sheets WHERE id=$1 FOR UPDATE", [id]))
      .rows[0];
    if (!old || old.revision !== revision)
      throw Error("版本衝突：請重新載入最新 Sheet");
    const parsed = sheetSchema.parse(content);
    await q(
      "INSERT INTO changes(id,sheet_id,before_json,after_revision) VALUES($1,$2,$3,$4)",
      [randomUUID(), id, JSON.stringify(old.content), revision + 1],
    );
    return (
      await q(
        "UPDATE sheets SET content=$1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *",
        [JSON.stringify(parsed), id],
      )
    ).rows[0];
  });
}
export async function approve(items: { id: string; revision: number }[]) {
  if (!items.length || items.length > 30) throw Error("請選擇 1–30 張 Sheet");
  return transaction(async (q) => {
    const result = [];
    for (const item of items) {
      const s = (
        await q("SELECT * FROM sheets WHERE id=$1 FOR UPDATE", [item.id])
      ).rows[0];
      if (!s || s.revision !== item.revision)
        throw Error("內容已修改，請重新 review");
      const assets = (
        await q("SELECT * FROM assets WHERE id = ANY($1::text[])", [
          s.content.assetIds,
        ])
      ).rows;
      const errors = validatePublish(s.content, assets);
      if (assets.length && s.content.platforms.some((p: string) => ["threads", "instagram"].includes(p)) && !process.env.MEDIA_PUBLIC_BASE_URL?.startsWith("https://")) errors.push("Threads／Instagram 素材需要設定 MEDIA_PUBLIC_BASE_URL 公開 HTTPS 入口");
      if (errors.length)
        throw Error(`${s.content.title || "未命名"}：${errors.join("；")}`);
      for (const platform of s.content.platforms) {
        const account = (
          await q("SELECT value FROM settings WHERE key=$1", [
            "account:" + platform,
          ])
        ).rows[0]?.value;
        if (!account) throw Error(`${platform} 尚未連接`);
        const r = await q(
          `INSERT INTO jobs(id,sheet_id,revision,platform,account_id,snapshot,scheduled_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(sheet_id,revision,platform) DO NOTHING RETURNING id`,
          [
            randomUUID(),
            s.id,
            s.revision,
            platform,
            account.id,
            JSON.stringify({
              ...s.content,
              contextSnapshot:
                (await q("SELECT value FROM settings WHERE key='brand'"))
                  .rows[0]?.value ?? "",
            }),
            s.content.scheduledAt || new Date().toISOString(),
          ],
        );
        result.push(...r.rows);
      }
    }
    return result;
  });
}
