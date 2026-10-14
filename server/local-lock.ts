import { mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

// PGlite must never be opened by two server processes at the same time.
export function acquireLocalLock() {
  if (process.env.DATABASE_URL) return;
  mkdirSync("data", { recursive: true });
  const file = "data/server.lock";
  try {
    const pid = Number(readFileSync(file, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error("Invalid server lock");
    try {
      process.kill(pid, 0);
      throw Error(`PROMO is already running (PID ${pid})`);
    } catch (error: any) {
      if (error.code !== "ESRCH") throw error;
    }
    unlinkSync(file);
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  const fd = openSync(file, "wx");
  writeFileSync(fd, String(process.pid));
  process.on("exit", () => {
    try { unlinkSync(file); } catch {}
  });
}
