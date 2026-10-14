import { test, after } from "node:test";
import assert from "node:assert/strict";
const empty = {
  title: "",
  body: "",
  tags: [],
  platforms: [],
  assetIds: [],
  scheduledAt: null,
  location: "",
};
import { validatePublish, postText } from "../shared/model.js";
import { RemoteError, remote } from "../server/platforms.js";
test("Chinese weighted X length, no silent truncation", () => {
  const c = { ...empty, platforms: ["x"] as "x"[], body: "文".repeat(141) };
  assert.ok(validatePublish(c, []).some((e) => e.includes("280")));
  assert.equal(postText(c).length, 141);
});
test("mixed video and image rejected before submission", () => {
  const ids = ["a", "b"];
  assert.ok(
    validatePublish(
      { ...empty, body: "hello", platforms: ["facebook"], assetIds: ids },
      [
        { id: "a", mime: "video/mp4", size: 10 },
        { id: "b", mime: "image/png", size: 10 },
      ],
    ).some((e) => e.includes("單獨")),
  );
});
test("unknown asset and invalid schedule rejected", () => {
  assert.ok(
    validatePublish(
      {
        ...empty,
        body: "hello",
        platforms: ["x"],
        assetIds: ["missing"],
        scheduledAt: "broken",
      },
      [],
    ).length === 2,
  );
});
test("remote timeout after dispatch is uncertain, not safe retry", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("timeout");
  };
  try {
    await assert.rejects(
      () => remote("https://example.invalid", "fake", { method: "POST" }, true),
      (e: any) => e instanceof RemoteError && e.uncertain,
    );
  } finally {
    globalThis.fetch = original;
  }
});
import { publish, verifyAccount, fetchMetrics } from '../server/platforms.js';
import { mediaSignature, validMediaSignature } from '../server/secrets.js';
test('Threads text publishes via container, and permalink failure does not retry publication', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url); calls.push(u);
    if (u.includes('threads_publish')) return new Response(JSON.stringify({id:'post1'}));
    if (u.includes('fields=status')) return new Response(JSON.stringify({status:'FINISHED'}));
    if (u.includes('permalink')) throw Error('network');
    return new Response(JSON.stringify({id:'container1'}));
  };
  try {
    const result = await publish({platform:'threads', id:'user1',name:'test',token:'fake'}, {...empty,body:'Hello',platforms:['threads']}, []);
    assert.deepEqual(result, {id:'post1',url:null});
    assert.equal(calls.filter(x=>x.includes('threads_publish')).length,1);
  } finally { globalThis.fetch = original; }
});
test('Instagram validates media and new platform limits', () => {
  assert.ok(validatePublish({...empty,body:'Hi',platforms:['instagram']},[]).some(e=>e.includes('需要圖片')));
  assert.ok(validatePublish({...empty,body:'a'.repeat(501),platforms:['threads']},[]).some(e=>e.includes('500')));
});
test('signed media rejects tampered and expired URLs', () => {
  const expires = String(Date.now()+60000);
  const signature = mediaSignature('asset1',expires);
  assert.equal(validMediaSignature('asset1',expires,signature),true);
  assert.equal(validMediaSignature('asset2',expires,signature),false);
  assert.equal(validMediaSignature('asset1','1',mediaSignature('asset1','1')),false);
});
test('Instagram Login identity and Threads metrics use separate API hosts',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    if(String(url).includes('graph.instagram.com')) return new Response(JSON.stringify({user_id:'ig1',username:'notedaily'}));
    return new Response(JSON.stringify({data:[{name:'views',values:[{value:12}]},{name:'likes',values:[{value:3}]}]}));
  };
  try {
    assert.equal((await verifyAccount('instagram','fake')).id,'ig1');
    const m=await fetchMetrics({platform:'threads',id:'t1',name:'test',token:'fake'},'p1');
    assert.equal(m.views,12);assert.equal(m.like_count,3);assert.equal(m.reply_count,null);
  } finally {globalThis.fetch=original;}
});
