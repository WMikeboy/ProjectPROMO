import { randomUUID } from "node:crypto";
import { query, setting } from "./db.js";
import { decrypt } from "./secrets.js";
import { refreshedXAccount } from "./oauth.js";
import {
  publish,
  fetchMetrics,
  RemoteError,
  type Account,
} from "./platforms.js";
let busy = false;
export async function accountFor(platform: string): Promise<Account> {
  const a =
    platform === "x"
      ? await refreshedXAccount()
      : await setting("account:" + platform);
  if (!a) throw Error("帳號尚未連接");
  return { ...a, token: decrypt(a.token) };
}
export async function syncJob(id: string) {
  const job = (
    await query("SELECT * FROM jobs WHERE id=$1 AND status='succeeded'", [id])
  ).rows[0];
  if (!job) throw Error("僅已發佈帖子可同步");
  try {
    const account = await accountFor(job.platform);
    if (account.id !== job.account_id)
      throw Error("目前連接帳號與發佈帳號不同");
    const values = await fetchMetrics(account, job.post_id);
    await query("INSERT INTO metrics(id,job_id,values_json) VALUES($1,$2,$3)", [
      randomUUID(),
      id,
      JSON.stringify(values),
    ]);
    await query("UPDATE jobs SET synced_at=now(),sync_error=NULL WHERE id=$1", [
      id,
    ]);
    return values;
  } catch (e) {
    await query("UPDATE jobs SET synced_at=now(),sync_error=$1 WHERE id=$2", [
      e instanceof Error ? e.message : "同步失敗",
      id,
    ]);
    throw e;
  }
}
export async function tick() {
  if (busy) return;
  busy = true;
  try {
    await query(
      "UPDATE jobs SET status='needs_attention',error='執行超過租約／程序中斷，請先核對平台結果' WHERE status='running' AND started_at < now()-interval '20 minutes'",
    );
    const job = (
      await query(
        `UPDATE jobs SET status='running',started_at=now() WHERE id=(SELECT id FROM jobs WHERE status='queued' AND scheduled_at<=now() ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      )
    ).rows[0];
    if (job) {
      try {
        const account = await accountFor(job.platform);
        if (account.id !== job.account_id)
          throw Error("帳號已更換，請人工核對");
        const rows = (
          await query("SELECT * FROM assets WHERE id=ANY($1::text[])", [
            job.snapshot.assetIds,
          ])
        ).rows;
        const assets = job.snapshot.assetIds.map((id: string) =>
          rows.find((a) => a.id === id),
        );
        if (assets.some((a: any) => !a)) throw Error("素材遺失");
        const r = await publish(account, job.snapshot, assets);
        // Once external publish returns, a DB failure must NEVER be classified as safe-to-retry.
        try {
          await query(
            "UPDATE jobs SET status='succeeded',post_id=$1,url=$2,error=NULL WHERE id=$3",
            [r.id, r.url, job.id],
          );
        } catch {
          throw new RemoteError(
            "平台已回傳成功但資料庫回寫失敗，請人工核對",
            true,
          );
        }
      } catch (e) {
        await query("UPDATE jobs SET status=$1,error=$2 WHERE id=$3", [
          e instanceof RemoteError && e.uncertain
            ? "needs_attention"
            : "failed",
          e instanceof Error ? e.message : "發佈失敗",
          job.id,
        ]);
      }
    } else {
      const due = (
        await query(
          "SELECT id FROM jobs WHERE status='succeeded' AND (synced_at IS NULL OR synced_at<now()-interval '6 hours') ORDER BY synced_at NULLS FIRST LIMIT 1",
        )
      ).rows[0];
      if (due) await syncJob(due.id).catch(() => {});
    }
  } catch (e) {
    console.error("Worker unavailable; retrying next tick");
  } finally {
    busy = false;
  }
}
