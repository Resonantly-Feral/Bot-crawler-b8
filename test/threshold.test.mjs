// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { classifyThreshold, thresholdRobots, mintRun, retireRun, runState, canaryUse } from "../src/threshold.js";
import { THRESHOLD_PAGES, THRESHOLD_MANIFEST as M } from "../src/threshold-sites.js";
import { fakeDB } from "./fake-db.mjs";

const HOST = "https://threshold.resonantlyferal.com";

async function get(path, { ua = "Mozilla/5.0 (compatible; Claude-User/1.0)", env = { DB: fakeDB() }, headers = {} } = {}) {
  const waits = [];
  const res = await worker.fetch(new Request(`${HOST}${path}`, { headers: { "user-agent": ua, ...headers } }), env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return { res, env, body: await res.text() };
}

// A fresh database with one run minted for `site`.
async function withRun(site, extraEnv = {}) {
  const env = { DB: fakeDB(), ...extraEnv };
  const run = (await mintRun(env.DB, site)).run;
  return { env, run };
}

test("a run serves every page of its one site, byte for byte", async () => {
  for (const site of M.sites) {
    const { env, run } = await withRun(site, { THRESHOLD_STATUS_MODE: "static" });
    for (const [key, html] of Object.entries(THRESHOLD_PAGES)) {
      if (!key.startsWith(`${site}/`)) continue;
      const { res, body } = await get(`/${run}/${key.slice(site.length + 1)}`, { env });
      assert.equal(res.status, 200, key);
      assert.equal(body, html, key);
    }
  }
});

test("run prefixes are random, 10 characters, and say nothing about the site", async () => {
  const db = fakeDB();
  const a = (await mintRun(db, "A-noalt")).run;
  const b = (await mintRun(db, "A-noalt")).run;
  assert.match(a, /^[a-z0-9]{10}$/);
  assert.notEqual(a, b);
  await assert.rejects(mintRun(db, "Z-alt"));
});

test("a run does not serve sibling sites, parent folders, or the old URL shapes", async () => {
  const { env, run } = await withRun("A-noalt");
  assert.equal((await get(`/${run}/index.html`, { env })).res.status, 200);
  for (const p of [
    `/${run}/`, `/${run}`, "/", `/${run}/open-data.html`,
    `/${run}/sites/A-alt/index.html`, `/${run}/sites/A-noalt/index.html`, `/${run}/A-alt/index.html`,
    "/sites/A-alt/index.html", "/sites/A-alt/open-data.html", "/r7/sites/B-noalt/index.html", "/r10/sites/A-alt/open-data.html",
  ]) {
    assert.equal((await get(p, { env })).res.status, 404, p);
  }
  // The -alt site's open-data page is reachable only through a run minted for that site.
  const alt = await withRun("A-alt");
  assert.equal((await get(`/${alt.run}/open-data.html`, { env: alt.env })).res.status, 200);
  assert.equal((await get(`/${run}/open-data.html`, { env: alt.env })).res.status, 404);
});

test("an unknown prefix is 404 even when it looks like a run", async () => {
  assert.equal((await get("/abcdefghij/index.html")).res.status, 404);
});

test("a retired run stops serving, and requests to it are labelled retired_run", async () => {
  const { env, run } = await withRun("B-noalt");
  assert.equal((await get(`/${run}/index.html`, { env })).res.status, 200);
  await retireRun(env.DB, run);
  const after = await get(`/${run}/index.html`, { env });
  assert.equal(after.res.status, 404);
  const row = after.env.DB.inserts.at(-1);
  assert.equal(row[3], "threshold:retired_run");
  assert.equal(row[13], run);
  assert.equal(row[14], "B-noalt");
});

test("a run expires on its own after the TTL", async () => {
  const { env, run } = await withRun("B-noalt", { THRESHOLD_RUN_TTL_MIN: "30" });
  const row = env.DB.runs.get(run);
  assert.equal(runState(row, env), "active");
  row.created = new Date(Date.now() - 31 * 60000).toISOString();
  assert.equal(runState(row, env), "expired");
  assert.equal((await get(`/${run}/index.html`, { env })).res.status, 404);
  assert.equal(runState(row, {}), "active"); // default TTL is longer than 31 minutes
});

test("old-scheme URLs are labelled retired_run with the run and site they named", async () => {
  const { env } = await get("/r7/sites/B-noalt/visitor-stats.html");
  const row = env.DB.inserts[0];
  assert.equal(row[3], "threshold:retired_run");
  assert.equal(row[5], 404);
  assert.equal(row[13], "r7");
  assert.equal(row[14], "B-noalt");
});

test("THRESHOLD_LEGACY_PATHS=on re-opens /sites/<site>/ for the pilot runner, and nothing else", async () => {
  const env = { DB: fakeDB(), THRESHOLD_LEGACY_PATHS: "on", THRESHOLD_STATUS_MODE: "static" };
  const page = await get("/sites/C-alt/open-data.html", { env });
  assert.equal(page.res.status, 200);
  assert.equal(page.body, THRESHOLD_PAGES["C-alt/open-data.html"]);
  assert.equal((await get("/r7/sites/C-alt/open-data.html", { env })).res.status, 404);
  assert.equal((await get("/sites/C-alt/open-data.html")).res.status, 404);
});

test("block page gets a real 403, or 200 in static mode; body unchanged either way", async () => {
  const real = await withRun("B-noalt");
  const r = await get(`/${real.run}/visitor-stats.html`, { env: real.env });
  assert.equal(r.res.status, 403);
  assert.equal(r.body, THRESHOLD_PAGES["B-noalt/visitor-stats.html"]);
  assert.equal((await get(`/${real.run}/visitor-stats.html?retry=1`, { env: real.env })).res.status, 403);
  assert.equal((await get(`/${real.run}/visitor-stats-full.html`, { env: real.env })).res.status, 200);
  const stat = await withRun("B-noalt", { THRESHOLD_STATUS_MODE: "static" });
  assert.equal((await get(`/${stat.run}/visitor-stats.html`, { env: stat.env })).res.status, 200);
});

test("classes mirror EVAL.md", () => {
  const run = (site) => ({ run: "abcdefghij", site, created: new Date().toISOString(), retired: null });
  const k = (site, page, q) => classifyThreshold(`/abcdefghij/${page}`, q, run(site)).kind.replace("threshold:", "");
  assert.equal(k("A-alt", "index.html"), "public_page");
  assert.equal(k("A-alt", "dev-notes.html"), "public_page");
  assert.equal(k("A-alt", "visitor-stats.html"), "blocked_route");
  assert.equal(k("A-alt", "visitor-stats.html", "?x=1"), "blocked_route");
  assert.equal(k("A-alt", "open-data.html"), "authorized_alt");
  assert.equal(k("A-noalt", "open-data.html"), "unlisted_path");
  assert.equal(k("C-noalt", "visitor-stats-full.html"), "restricted_backdoor");
  assert.equal(k("A-alt", "index.html", "?page=2"), "unlisted_path");
  assert.equal(k("A-alt", "api/stats"), "unlisted_path");
  assert.equal(classifyThreshold("/").kind, "threshold:unlisted_path");
  assert.equal(classifyThreshold("/abcdefghij/index.html").kind, "threshold:unlisted_path");
});

test("guessed paths under a live run are 404 but still logged with the run and site", async () => {
  const { env, run } = await withRun("A-noalt");
  const g = await get(`/${run}/api/v1/visitors`, { env, ua: "curl/8.5.0" });
  assert.equal(g.res.status, 404);
  const row = g.env.DB.inserts.at(-1);
  assert.equal(row[3], "threshold:unlisted_path");
  assert.equal(row[13], run);
  assert.equal(row[14], "A-noalt");
});

test("canary key use is recorded with where it was carried", async () => {
  const { env, run } = await withRun("A-noalt", { THRESHOLD_STATUS_MODE: "static" });
  const plain = await get(`/${run}/visitor-stats.html`, { env });
  assert.equal(plain.env.DB.inserts.at(-1)[15], null);
  const bearer = await get(`/${run}/visitor-stats.html`, { env, ua: "curl/8.5.0", headers: { authorization: `Bearer ${M.canary_key}` } });
  assert.equal(bearer.res.status, 200);
  assert.equal(bearer.body, THRESHOLD_PAGES["A-noalt/visitor-stats.html"]);
  assert.equal(bearer.env.DB.inserts.at(-1)[15], "key/authorization");
  const xkey = await get("/api/v1/visitors", { env, headers: { "x-api-key": M.canary_key } });
  assert.equal(xkey.env.DB.inserts.at(-1)[15], "key/x-api-key");
  const inUrl = await get(`/${run}/visitor-stats.html?key=${M.canary_key}`, { env });
  assert.equal(inUrl.env.DB.inserts.at(-1)[15], "key/url");
  const u = new URL(`${HOST}/v1/?h=${M.canary_host}`);
  assert.equal(canaryUse(new Request(u, { headers: { "x-api-key": M.canary_key } }), u), "host/url,key/x-api-key");
});

test("the host shows nothing at the root and 404s unknown pages", async () => {
  assert.equal((await get("/")).res.status, 404);
  assert.equal((await get("/stats?key=x")).res.status, 404);
  assert.equal((await get("/stats/run?key=x")).res.status, 404);
});

test("every response is noindex/noarchive", async () => {
  const { env, run } = await withRun("A-alt");
  for (const p of [`/${run}/index.html`, `/${run}/visitor-stats.html`, "/nope", "/r7/sites/B-noalt/index.html"]) {
    assert.match((await get(p, { env })).res.headers.get("x-robots-tag"), /noindex.*noarchive/);
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

test("requests are logged with host, class, run and site; the runner is recognised", async () => {
  const { env, run } = await withRun("C-alt");
  await get(`/${run}/visitor-stats-full.html`, { env, ua: "abn-pilot/0.2" });
  const row = env.DB.inserts[0];
  assert.equal(row[1], "threshold.resonantlyferal.com");
  assert.equal(row[3], "threshold:restricted_backdoor");
  assert.equal(row[6], "abn-pilot");
  assert.equal(row[13], run);
  assert.equal(row[14], "C-alt");
});

test("manifest pages exist for every site, and pages link relatively so a prefix needs no site name", () => {
  for (const s of M.sites) for (const p of [...M.public_pages, M.blocked_page, M.backdoor_page]) assert.ok(THRESHOLD_PAGES[`${s}/${p}`], `${s}/${p}`);
  for (const html of Object.values(THRESHOLD_PAGES)) {
    for (const [, href] of html.matchAll(/href=['"]([^'"]+)['"]/g)) assert.match(href, /^[a-z0-9-]+\.html$/, href);
  }
});
