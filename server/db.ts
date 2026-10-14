import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import { acquireLocalLock } from "./local-lock.js";
if (process.env.TEST_DB !== "memory") acquireLocalLock();
await mkdir("data", { recursive: true });
const engine = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : new PGlite(process.env.TEST_DB === "memory" ? "memory://" : "data/db");
export async function closeDatabase() {
  if (engine instanceof PGlite) await engine.close();
  else await engine.end();
}
export async function query(
  sql: string,
  params: any[] = [],
): Promise<{ rows: any[] }> {
  return (engine as any).query(sql, params);
}
let tail = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = tail.then(fn, fn);
  tail = next.then(
    () => {},
    () => {},
  );
  return next;
}
export async function transaction<T>(
  fn: (q: typeof query) => Promise<T>,
): Promise<T> {
  if (engine instanceof pg.Pool) {
    const c = await engine.connect();
    try {
      await c.query("BEGIN");
      const v = await fn((s, p = []) => c.query(s, p));
      await c.query("COMMIT");
      return v;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return engine.transaction(async (tx) =>
    fn((s, p = []) => tx.query(s, p) as any),
  );
}
export async function init() {
  const schema = `CREATE TABLE IF NOT EXISTS settings(key text PRIMARY KEY,value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS sheets(id text PRIMARY KEY,revision integer NOT NULL DEFAULT 1,content jsonb NOT NULL,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS assets(id text PRIMARY KEY,name text NOT NULL,mime text NOT NULL,size integer NOT NULL,path text NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS jobs(id text PRIMARY KEY,sheet_id text NOT NULL,revision integer NOT NULL,platform text NOT NULL,account_id text NOT NULL,snapshot jsonb NOT NULL,status text NOT NULL DEFAULT 'queued',scheduled_at timestamptz NOT NULL DEFAULT now(),post_id text,url text,error text,started_at timestamptz,created_at timestamptz DEFAULT now(),synced_at timestamptz,sync_error text,UNIQUE(sheet_id,revision,platform));
CREATE TABLE IF NOT EXISTS metrics(id text PRIMARY KEY,job_id text NOT NULL,values_json jsonb NOT NULL,fetched_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS messages(id text PRIMARY KEY,role text NOT NULL,content text NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS changes(id text PRIMARY KEY,sheet_id text NOT NULL,before_json jsonb NOT NULL,after_revision integer NOT NULL,created_at timestamptz DEFAULT now());
ALTER TABLE sheets ADD COLUMN IF NOT EXISTS derived_from text;
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,scheduled_at);`;
  for (const sql of schema.split(";").filter((s) => s.trim())) await query(sql);
}
export async function setting(key: string) {
  return (await query("SELECT value FROM settings WHERE key=$1", [key])).rows[0]
    ?.value;
}
export async function saveSetting(key: string, value: any) {
  await query(
    "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
    [key, JSON.stringify(value)],
  );
}

export async function close() {
  if (engine instanceof pg.Pool) await engine.end();
  else await engine.close();
}
