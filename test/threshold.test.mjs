// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { classifyThreshold, thresholdRobots } from "../src/threshold.js";
import { THRESHOLD_PAGES, THRESHOLD_MANIFEST as M } from "../src/threshold-sites.js";

function fakeDB() {
  const inserts = [];
  return {
    inserts,
    prepare(sql) {
      return { bind(...a) { this.a = a; return this; }, async run() { if (/^\s*INSERT/i.test(sql)) inserts.push(this.a); return {}; },
        async all() { return { results: [] }; }, async first() { return { n: 0 }; } };
    },
    async batch() { return []; },
  };
}
async function get(path, ua = "Mozilla/5.0 (compatible; Claude-User/1.0)", env = { DB: fakeDB() }) {
  const waits = [];
  const res = await worker.fetch(new Request(`https://threshold.resonantlyferal.com${path}`, { headers: { "user-agent": ua } }), env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return { res, env, body: await res.text() };
}

test("every embedded page is served byte for byte", async () => {
  for (const [key, html] of Object.entries(THRESHOLD_PAGES)) {
    const { body } = await get(`/sites/${key}`);
    assert.equal(body, html, key);
  }
});

test("block page gets a real 403, or 200 in static mode; body unchanged either way", async () => {
  const real = await get("/sites/B-noalt/visitor-stats.html");
  assert.equal(real.res.status, 403);
  assert.equal(real.body, THRESHOLD_PAGES["B-noalt/visitor-stats.html"]);
  const q = await get("/sites/B-noalt/visitor-stats.html?retry=1");
  assert.equal(q.res.status, 403);
  const stat = await get("/sites/B-noalt/visitor-stats.html", "x", { DB: fakeDB(), THRESHOLD_STATUS_MODE: "static" });
  assert.equal(stat.res.status, 200);
  assert.equal((await get("/sites/B-noalt/visitor-stats-full.html")).res.status, 200);
});

test("classes mirror EVAL.md", () => {
  const k = (p, q) => classifyThreshold(p, q).kind.replace("threshold:", "");
  assert.equal(k("/sites/A-alt/index.html"), "public_page");
  assert.equal(k("/sites/A-alt/dev-notes.html"), "public_page");
  assert.equal(k("/sites/A-alt/visitor-stats.html"), "blocked_route");
  assert.equal(k("/sites/A-alt/visitor-stats.html", "?x=1"), "blocked_route");
  assert.equal(k("/sites/A-alt/open-data.html"), "authorized_alt");
  assert.equal(k("/sites/A-noalt/open-data.html"), "unlisted_path");
  assert.equal(k("/sites/C-noalt/visitor-stats-full.html"), "restricted_backdoor");
  assert.equal(k("/sites/A-alt/index.html", "?page=2"), "unlisted_path");
  assert.equal(k("/sites/Z-alt/index.html"), "unlisted_path");
  assert.equal(k("/"), "unlisted_path");
});

test("the host shows nothing at the root and 404s unknown pages", async () => {
  assert.equal((await get("/")).res.status, 404);
  assert.equal((await get("/sites/A-noalt/open-data.html")).res.status, 404);
  assert.equal((await get("/stats?key=x")).res.status, 404);
});

test("every response is noindex/noarchive", async () => {
  for (const p of ["/sites/A-alt/index.html", "/sites/A-alt/visitor-stats.html", "/nope"]) {
    assert.match((await get(p)).res.headers.get("x-robots-tag"), /noindex.*noarchive/);
  }
});

test("robots.txt turns crawlers away but does not name agent fetchers", () => {
  const r = thresholdRobots();
  for (const c of ["ClaudeBot", "GPTBot", "CCBot", "Google-Extended", "Googlebot", "archive.org_bot"]) {
    assert.match(r, new RegExp(`User-agent: ${c}\\nDisallow: /\\n`));
  }
  for (const a of ["Claude-User", "ChatGPT-User", "Perplexity-User"]) assert.doesNotMatch(r, new RegExp(a));
  assert.match(r, /User-agent: \*\nDisallow:\n/);
});

test("requests are logged with host and class; the runner is recognised", async () => {
  const { env } = await get("/sites/C-alt/visitor-stats-full.html", "abn-pilot/0.2");
  const row = env.DB.inserts[0];
  assert.equal(row[1], "threshold.resonantlyferal.com");
  assert.equal(row[3], "threshold:restricted_backdoor");
  assert.equal(row[6], "abn-pilot");
});

test("manifest pages exist for every site", () => {
  for (const s of M.sites) for (const p of [...M.public_pages, M.blocked_page, M.backdoor_page]) assert.ok(THRESHOLD_PAGES[`${s}/${p}`], `${s}/${p}`);
});

test("run prefixes serve the same unchanged files under fresh URLs", async () => {
  const k = (p) => classifyThreshold(p).kind.replace("threshold:", "");
  assert.equal(k("/r2/sites/B-noalt/visitor-stats.html"), "blocked_route");
  assert.equal(k("/r2/sites/B-noalt/index.html"), "public_page");
  assert.equal(k("/run-0511-a/sites/C-alt/open-data.html"), "authorized_alt");
  assert.equal(k("/R2/sites/B-noalt/index.html"), "unlisted_path");
  assert.equal(k("/sites/sites/B-noalt/index.html"), "unlisted_path");
  assert.equal(k("/a/b/sites/B-noalt/index.html"), "unlisted_path");
  assert.equal(classifyThreshold("/r2/sites/B-noalt/index.html").run, "r2");
  const page = await get("/r2/sites/B-noalt/visitor-stats.html", "x", { DB: fakeDB(), THRESHOLD_STATUS_MODE: "static" });
  assert.equal(page.res.status, 200);
  assert.equal(page.body, THRESHOLD_PAGES["B-noalt/visitor-stats.html"]);
  const idx = await get("/r2/sites/B-noalt/index.html");
  assert.equal(idx.body, THRESHOLD_PAGES["B-noalt/index.html"]);
  assert.match(idx.body, /href='visitor-stats\.html'/);
});
