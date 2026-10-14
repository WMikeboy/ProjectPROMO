import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.TEST_DB = "memory";
delete process.env.DATABASE_URL;
const { init, query, saveSetting, close } = await import("../server/db.js");
const { createSheet, updateSheet, approve, empty } =
  await import("../server/store.js");
await init();
after(async () => close());
test("drafts never enqueue; stale writes rejected; approval snapshots and deduplication", async () => {
  const s = await createSheet({
    ...empty,
    title: "Launch",
    body: "Hello",
    platforms: ["x", "facebook"],
  });
  assert.equal((await query("SELECT * FROM jobs")).rows.length, 0);
  const next = await updateSheet(s.id, 1, { ...s.content, body: "Reviewed" });
  await assert.rejects(() => updateSheet(s.id, 1, s.content), /版本衝突/);
  await saveSetting("account:x", { id: "x-user" });
  await saveSetting("account:facebook", { id: "fb-page" });
  await approve([{ id: s.id, revision: next.revision }]);
  await approve([{ id: s.id, revision: next.revision }]);
  assert.equal(
    (await query("SELECT * FROM jobs WHERE sheet_id=$1", [s.id])).rows.length,
    2,
  );
  await updateSheet(s.id, next.revision, {
    ...next.content,
    body: "Changed later",
  });
  const jobs = (await query("SELECT * FROM jobs WHERE sheet_id=$1", [s.id]))
    .rows;
  assert.ok(jobs.every((j) => j.snapshot.body === "Reviewed"));
});
test("batch validation failure rolls back ALL jobs", async () => {
  const good = await createSheet({ ...empty, body: "Good", platforms: ["x"] });
  const bad = await createSheet({
    ...empty,
    body: "文".repeat(150),
    platforms: ["x"],
  });
  await assert.rejects(() =>
    approve([
      { id: good.id, revision: 1 },
      { id: bad.id, revision: 1 },
    ]),
  );
  assert.equal(
    (await query("SELECT * FROM jobs WHERE sheet_id=$1", [good.id])).rows
      .length,
    0,
  );
});
test("worker claim skips future schedule and is atomic", async () => {
  await query("UPDATE jobs SET status='cancelled'");
  const s = await createSheet({
    ...empty,
    body: "Future",
    platforms: ["x"],
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await approve([{ id: s.id, revision: 1 }]);
  const claimed = await query(
    "UPDATE jobs SET status='running' WHERE id=(SELECT id FROM jobs WHERE status='queued' AND scheduled_at<=now() FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",
  );
  assert.equal(claimed.rows.length, 0);
});

test("partial platform failure preserves success; failed metrics do not change publishing state", async () => {
  await query("UPDATE jobs SET status='cancelled'");
  const { encrypt } = await import("../server/secrets.js");
  const { tick, syncJob } = await import("../server/worker.js");
  await saveSetting("account:x", {
    id: "x-user",
    platform: "x",
    name: "Test X",
    token: encrypt("test-token"),
  });
  await saveSetting("account:facebook", {
    id: "fb-page",
    platform: "facebook",
    name: "Test FB",
    token: encrypt("test-token"),
  });
  const sheet = await createSheet({
    ...empty,
    body: "Partial success test",
    platforms: ["x", "facebook"],
  });
  await approve([{ id: sheet.id, revision: 1 }]);
  const original = globalThis.fetch;
  let publishes = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/2/tweets") && options?.method === "POST") {
      publishes++;
      return new Response(JSON.stringify({ data: { id: "123456" } }), {
        status: 201,
      });
    }
    return new Response(JSON.stringify({ error: { code: 10 } }), {
      status: 403,
    });
  };
  try {
    await tick();
    await tick();
    const jobs = (
      await query("SELECT * FROM jobs WHERE sheet_id=$1", [sheet.id])
    ).rows;
    assert.equal(jobs.find((j) => j.platform === "x").status, "succeeded");
    assert.equal(jobs.find((j) => j.platform === "facebook").status, "failed");
    assert.equal(publishes, 1);
    const x = jobs.find((j) => j.platform === "x");
    await assert.rejects(() => syncJob(x.id));
    assert.equal(
      (await query("SELECT status FROM jobs WHERE id=$1", [x.id])).rows[0]
        .status,
      "succeeded",
    );
    assert.equal(publishes, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("DeepSeek tool loop creates multiple drafts without publishing", async () => {
  const { encrypt } = await import("../server/secrets.js");
  const { runAgent } = await import("../server/agent.js");
  await saveSetting("deepseek", {
    key: encrypt("test-key"),
    model: "test-model",
  });
  const before = (await query("SELECT * FROM jobs")).rows.length;
  const original = globalThis.fetch;
  let turn = 0;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    turn++;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message:
              turn === 1
                ? {
                    role: "assistant",
                    content: null,
                    tool_calls: [1, 2].map((n) => ({
                      id: "call" + n,
                      type: "function",
                      function: {
                        name: "create_sheet",
                        arguments: JSON.stringify({
                          title: "Draft " + n,
                          body: "AI test",
                          platforms: ["x"],
                        }),
                      },
                    })),
                  }
                : { role: "assistant", content: "已建立兩張草稿。" },
          },
        ],
      }),
      { status: 200 },
    );
  };
  try {
    const result = await runAgent("建立兩篇");
    assert.equal(result.changes, 2);
    assert.equal(turn, 2);
    assert.equal((await query("SELECT * FROM jobs")).rows.length, before);
    assert.equal(
      (await query("SELECT * FROM sheets WHERE content->>'body'='AI test'"))
        .rows.length,
      2,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('X OAuth callback rejects authorization from another browser', async () => {
  const { startXOAuth, registerOAuthCallback } = await import('../server/oauth.js');
  const old = process.env.X_CLIENT_ID;
  process.env.X_CLIENT_ID = 'test-client';
  let callback: any;
  let cookie = '';
  let status = 200;
  try {
    registerOAuthCallback({ get: (_path: string, handler: any) => { callback = handler; } } as any);
    const url = new URL(startXOAuth({ cookie: (_name: string, value: string) => { cookie = value; } } as any));
    assert.ok(cookie.length >= 32);
    await callback({ query: { state: url.searchParams.get('state'), code: 'fake-code' }, headers: { cookie: 'promo_oauth=wrong' } }, { status: (value: number) => { status = value; return {send: () => {}}; } });
    assert.equal(status, 400);
  } finally {
    if (old === undefined) delete process.env.X_CLIENT_ID; else process.env.X_CLIENT_ID = old;
  }
});
