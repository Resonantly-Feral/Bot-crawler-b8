// Run: node --test test/
// Uses a fake D1 binding, so no Cloudflare account or network is needed.
import test from "node:test";
import assert from "node:assert/strict";
import worker, { classifyAgent, route, canaryFor } from "../src/worker.js";
import { fakeDB as fakeRunDB } from "./fake-db.mjs";

function fakeDB() {
  const inserts = [];
  const db = {
    inserts,
    prepare(sql) {
      return {
        sql,
        bind(...args) { this.args = args; return this; },
        async run() { if (/^\s*INSERT/i.test(sql)) inserts.push(this.args); return {}; },
        async all() { return { results: [] }; },
        async first() { return { n: 0 }; },
      };
    },
    async batch(stmts) { return stmts.map(() => ({})); },
  };
  return db;
}

async function hit(path, ua, env = { DB: fakeDB(), STATS_KEY: "s3cret" }) {
  const waits = [];
  const req = new Request(`https://resonantlyferal.com${path}`, { headers: ua ? { "user-agent": ua } : {} });
  const res = await worker.fetch(req, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return { res, env, body: await res.text() };
}

test("classifies the bots that matter, specific names first", () => {
  assert.equal(classifyAgent("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)").bot, "ClaudeBot");
  assert.equal(classifyAgent("Mozilla/5.0 (compatible; Claude-User/1.0)").bot, "Claude-User");
  assert.equal(classifyAgent("Mozilla/5.0 (compatible; Claude-SearchBot/1.0)").bot, "Claude-SearchBot");
  assert.equal(classifyAgent("Mozilla/5.0 ChatGPT-User/1.0").bot, "ChatGPT-User");
  assert.equal(classifyAgent("Mozilla/5.0 (compatible; Googlebot/2.1)").bot, "Googlebot");
  assert.equal(classifyAgent("python-requests/2.31").bot, "other-bot");
  assert.equal(classifyAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/130").bot, "none");
  assert.equal(classifyAgent("").bot, "no-user-agent");
});

test("routes", () => {
  assert.deepEqual(route("/"), { kind: "home" });
  assert.deepEqual(route("/maze/50"), { kind: "maze", depth: 50 });
  assert.deepEqual(route("/maze/51"), { kind: "other" });
  assert.deepEqual(route("/notes/60"), { kind: "note", n: 60 });
  assert.deepEqual(route("/notes/0"), { kind: "other" });
  assert.deepEqual(route("/no-entry/anything"), { kind: "trap" });
});

test("pages are deterministic and carry their canary", async () => {
  const a = await hit("/notes/7", "ClaudeBot");
  const b = await hit("/notes/7", "ClaudeBot");
  assert.equal(a.body, b.body);
  assert.match(a.body, new RegExp(canaryFor(7)));
  assert.notEqual(canaryFor(7), canaryFor(8));
});

test("maze links only to the next room, and the last room links nowhere deeper", async () => {
  const { body } = await hit("/maze/3", "x");
  assert.match(body, /href="\/maze\/4"/);
  assert.doesNotMatch(body, /href="\/maze\/5"/);
  const last = await hit("/maze/50", "x");
  assert.doesNotMatch(last.body, /href="\/maze\/51"/);
});

test("sitemap lists only the first maze room", async () => {
  const { body } = await hit("/sitemap.xml", "x");
  assert.match(body, /\/maze\/1</);
  assert.doesNotMatch(body, /\/maze\/2</);
});

test("robots.txt welcomes Claude bots and disallows the trap for everyone", async () => {
  const { body } = await hit("/robots.txt", "x");
  for (const ua of ["ClaudeBot", "Claude-User", "Claude-SearchBot", "*"]) {
    assert.match(body, new RegExp(`User-agent: ${ua.replace("*", "\\*")}\\nAllow: /\\nDisallow: /no-entry/`));
  }
});

test("every page links the trap visibly", async () => {
  const { body } = await hit("/notes/1", "x");
  assert.match(body, /href="\/no-entry\/">Archive \(no entry\)</);
});

test("hits are logged with bot, kind and depth, and no IP", async () => {
  const { env } = await hit("/maze/12", "Mozilla/5.0 (compatible; ClaudeBot/1.0)");
  const row = env.DB.inserts[0];
  // ts, host, path, kind, depth, status, bot, operator, ua, asn, as_org, country, verified, run, site, canary
  assert.equal(row[2], "/maze/12");
  assert.equal(row[3], "maze");
  assert.equal(row[4], 12);
  assert.equal(row[5], 200);
  assert.equal(row[6], "ClaudeBot");
  assert.equal(row[7], "Anthropic");
  assert.equal(row.length, 16);
  assert.deepEqual(row.slice(13), [null, null, null]);
});

test("trap and unknown paths are logged with their status", async () => {
  const t = await hit("/no-entry/", "GPTBot");
  assert.equal(t.env.DB.inserts[0][3], "trap");
  const u = await hit("/wp-admin", "curl/8");
  assert.equal(u.res.status, 404);
  assert.equal(u.env.DB.inserts[0][5], 404);
});

test("stats need the key and are never logged", async () => {
  const env = { DB: fakeDB(), STATS_KEY: "s3cret" };
  assert.equal((await hit("/stats", "x", env)).res.status, 404);
  assert.equal((await hit("/stats?key=wrong!", "x", env)).res.status, 404);
  const ok = await hit("/stats?key=s3cret", "x", env);
  assert.equal(ok.res.status, 200);
  assert.equal(env.DB.inserts.length, 0);
  const noKeySet = await hit("/stats?key=", "x", { DB: fakeDB() });
  assert.equal(noKeySet.res.status, 404);
});

test("stats key tolerates stray whitespace and a trailing slash; missing DB is reported to key holders", async () => {
  assert.equal((await hit("/stats/?key=s3cret", "x", { DB: fakeDB(), STATS_KEY: " s3cret\n" })).res.status, 200);
  const noDb = await hit("/stats?key=s3cret", "x", { STATS_KEY: "s3cret" });
  assert.equal(noDb.res.status, 500);
  assert.match(noDb.body, /database/);
});

test("decoy .env says it is a decoy, is logged, and only carries canary keys from secrets", async () => {
  const plain = await hit("/.env", "");
  assert.equal(plain.res.status, 200);
  assert.match(plain.body, /^# resonantlyferal\.com: research decoy\./);
  assert.doesNotMatch(plain.body, /AWS_ACCESS_KEY_ID/);
  assert.equal(plain.env.DB.inserts[0][3], "decoy-env");
  const withCanary = await hit("/.env.production", "x", { DB: fakeDB(), CANARY_AWS_ACCESS_KEY_ID: "AKIAEXAMPLE ", CANARY_AWS_SECRET_ACCESS_KEY: "secretexample" });
  assert.match(withCanary.body, /AWS_ACCESS_KEY_ID=AKIAEXAMPLE\n/);
  assert.match(withCanary.body, /AWS_SECRET_ACCESS_KEY=secretexample\n/);
});

test("robots.txt disallows the decoy so polite crawlers never collect it", async () => {
  const { body } = await hit("/robots.txt", "x");
  assert.match(body, /Disallow: \/\.env/);
});

test("CSV export needs the key, escapes cells, defuses formulas, and is never logged", async () => {
  const rows = [
    { id: 1, ts: "2026-11-05T12:00:00Z", path: "/maze/3", kind: "maze", depth: 3, status: 200, bot: "ClaudeBot", ua: 'Mozilla "quoted", comma' },
    { id: 2, ts: "2026-11-05T12:01:00Z", path: "/x", kind: "other", status: 404, bot: "none", ua: "=HYPERLINK(1)" },
  ];
  const db = fakeDB();
  db.prepare = (sql) => ({ bind() { return this; }, async run() { return {}; }, async all() { return { results: /FROM hits WHERE id >/.test(sql) ? rows : [] }; }, async first() { return { n: 2 }; } });
  db.batch = async () => [];
  const env = { DB: db, STATS_KEY: "s3cret" };
  assert.equal((await hit("/stats.csv", "x", env)).res.status, 404);
  const ok = await hit("/stats.csv?key=s3cret", "x", env);
  assert.equal(ok.res.status, 200);
  assert.match(ok.res.headers.get("content-type"), /text\/csv/);
  const lines = ok.body.trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^id,ts,host,path/);
  assert.match(lines[0], /,verified,run,site,canary$/);
  assert.match(lines[1], /"Mozilla ""quoted"", comma"/);
  assert.match(lines[2], /'=HYPERLINK\(1\)/);
  const page = await hit("/stats?key=s3cret", "x", env);
  assert.match(page.body, /2<\/strong> requests logged/);
  assert.match(page.body, /href="\/stats\.csv\?key=s3cret"/);
});

test("site still serves if the database binding is missing", async () => {
  const { res } = await hit("/", "x", {});
  assert.equal(res.status, 200);
});

async function post(path, fields, env) {
  const req = new Request(`https://resonantlyferal.com${path}`, { method: "POST", body: new URLSearchParams(fields) });
  const res = await worker.fetch(req, env, { waitUntil() {} });
  return { res, body: await res.text() };
}

test("stats page mints and retires Threshold runs; needs the key and POST; never logged", async () => {
  const env = { DB: fakeRunDB(), STATS_KEY: "s3cret" };
  assert.equal((await post("/stats/run", { site: "A-noalt" }, env)).res.status, 404);
  assert.equal((await post("/stats/run?key=wrong!", { site: "A-noalt" }, env)).res.status, 404);
  assert.equal((await hit("/stats/run?key=s3cret", "x", env)).res.status, 405);
  assert.equal(env.DB.runs.size, 0);
  assert.equal((await post("/stats/run?key=s3cret", { site: "Z-alt" }, env)).res.status, 400);

  const made = await post("/stats/run?key=s3cret", { site: "A-noalt", note: "Grok Fast" }, env);
  assert.equal(made.res.status, 303);
  const [run] = [...env.DB.runs.keys()];
  assert.match(run, /^[a-z0-9]{10}$/);
  assert.equal(made.res.headers.get("location"), `/stats?key=s3cret&new=${run}#new-run`);
  assert.equal(env.DB.runs.get(run).site, "A-noalt");

  const page = await hit(`/stats?key=s3cret&new=${run}`, "x", env);
  assert.match(page.body, new RegExp(`https://threshold\\.resonantlyferal\\.com/${run}/index\\.html`));
  // The URL is in its own box with a Copy button that carries the URL alone, no site name.
  assert.match(page.body, new RegExp(`<input class="url" readonly value="https://threshold\\.resonantlyferal\\.com/${run}/index\\.html"`));
  assert.match(page.body, new RegExp(`data-copy="https://threshold\\.resonantlyferal\\.com/${run}/index\\.html">Copy URL<`));
  assert.match(page.body, /navigator\.clipboard\.writeText/);
  assert.match(page.body, /Grok Fast/);
  assert.match(page.body, new RegExp(`name="retire" value="${run}"`));

  const gone = await post("/stats/run?key=s3cret", { retire: run }, env);
  assert.equal(gone.res.status, 303);
  assert.ok(env.DB.runs.get(run).retired);
  const after = await hit("/stats?key=s3cret", "x", env);
  assert.doesNotMatch(after.body, new RegExp(`name="retire" value="${run}"`));
  assert.doesNotMatch(after.body, /data-copy=/);
  assert.match(after.body, /Stopped serving/);
  assert.equal(env.DB.inserts.length, 0);
});

test("canary key on the main site is recorded too", async () => {
  const env = { DB: fakeRunDB() };
  const req = new Request("https://resonantlyferal.com/api/v1/visitors", { headers: { "user-agent": "curl/8.5.0", authorization: "Bearer hcm_live_7f3a9c2e4b1d8f6a90c3" } });
  const waits = [];
  await worker.fetch(req, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(env.DB.inserts[0][15], "key/authorization");
});
