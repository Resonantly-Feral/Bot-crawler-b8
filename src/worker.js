// bot-crawler-b8: a bait site that records which automated clients visit it.
//
// Routes
//   /                 home page, links to every note and the start of the maze
//   /notes/<n>        generated bait pages (1..NOTE_COUNT), each with a unique canary token
//   /maze/<d>         depth maze (1..MAZE_DEPTH); each page links only to the next depth
//   /no-entry/...     trap: disallowed in robots.txt, linked visibly from every page
//   /robots.txt       explicitly allows the Claude bots, disallows the trap for everyone
//   /sitemap.xml      lists home, notes and /maze/1 only (deeper maze pages must be found by following links)
//   /stats?key=...    private stats page (needs the STATS_KEY secret); /stats.json for raw numbers
//   /stats/run?key=   POST only: mints or retires a Threshold run prefix (buttons on the stats page)
//
// Every request except /stats is logged to D1. No IP addresses are stored.
// Requests to threshold.resonantlyferal.com are handed to src/threshold.js.

import { thresholdResponse, canaryUse, mintRun, retireRun, listRuns, runState, runTtlMinutes } from "./threshold.js";
import { THRESHOLD_COMMIT, THRESHOLD_MANIFEST } from "./threshold-sites.js";
import { ensureSchema } from "./schema.js";

const HOST = "resonantlyferal.com";
const NOTE_COUNT = 60;
const MAZE_DEPTH = 50;
const TRAP = "/no-entry/";
// Paths scanners request hoping to find a leaked settings file.
const DECOY_PATHS = ["/.env", "/.env.local", "/.env.production", "/.env.bak", "/.env.backup"];

// First match wins, so specific names come before the generic catch-all.
const BOTS = [
  ["Claude-SearchBot", /Claude-SearchBot/i, "Anthropic"],
  ["Claude-User", /Claude-User/i, "Anthropic"],
  ["ClaudeBot", /ClaudeBot/i, "Anthropic"],
  ["anthropic-ai", /anthropic-ai/i, "Anthropic"],
  ["OAI-SearchBot", /OAI-SearchBot/i, "OpenAI"],
  ["ChatGPT-User", /ChatGPT-User/i, "OpenAI"],
  ["GPTBot", /GPTBot/i, "OpenAI"],
  ["Googlebot", /Googlebot/i, "Google"],
  ["Google-Other", /GoogleOther|Google-InspectionTool|Google-CloudVertexBot/i, "Google"],
  ["bingbot", /bingbot/i, "Microsoft"],
  ["CCBot", /CCBot/i, "Common Crawl"],
  ["Perplexity-User", /Perplexity-User/i, "Perplexity"],
  ["PerplexityBot", /PerplexityBot/i, "Perplexity"],
  ["Bytespider", /Bytespider/i, "ByteDance"],
  ["Applebot", /Applebot/i, "Apple"],
  ["Amazonbot", /Amazonbot/i, "Amazon"],
  ["meta-externalagent", /meta-externalagent|meta-externalfetcher|FacebookBot/i, "Meta"],
  ["DuckAssistBot", /DuckAssistBot|DuckDuckBot/i, "DuckDuckGo"],
  ["PetalBot", /PetalBot/i, "Huawei"],
  ["YandexBot", /YandexBot/i, "Yandex"],
  ["MistralAI-User", /MistralAI-User/i, "Mistral"],
  ["abn-pilot", /abn-pilot/i, "Threshold runner"],
  ["other-bot", /bot|crawl|spider|scrape|fetch|python|curl|wget|headless|httpclient|go-http|java\//i, "unknown"],
];

export function classifyAgent(ua) {
  if (!ua) return { bot: "no-user-agent", operator: "unknown" };
  for (const [name, re, operator] of BOTS) if (re.test(ua)) return { bot: name, operator };
  return { bot: "none", operator: "" };
}

// ---------- logging ----------

async function logHit(env, request, url, route, status) {
  if (!env.DB) return;
  const ua = request.headers.get("user-agent") || "";
  const { bot, operator } = classifyAgent(ua);
  const cf = request.cf || {};
  // Cloudflare's verified-bot flag is only exposed on plans with Bot Management.
  // On the free plan this stays null; check asn/as_org instead (a "ClaudeBot"
  // from a home-broadband network is almost certainly someone faking the name).
  const vb = cf.botManagement && cf.botManagement.verifiedBot;
  const verified = vb === undefined ? null : vb ? "yes" : "no";
  await ensureSchema(env.DB);
  await env.DB.prepare(
    `INSERT INTO hits (ts, host, path, kind, depth, status, bot, operator, ua, asn, as_org, country, verified, run, site, canary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    new Date().toISOString(), url.hostname, (url.pathname + url.search).slice(0, 500),
    route.kind, route.depth ?? null, status, bot, operator, ua.slice(0, 500),
    cf.asn ?? null, cf.asOrganization ?? null, cf.country ?? null, verified,
    // Threshold only: the run prefix and the site it serves (the URL no longer names the site).
    route.run ?? null, route.site ?? null,
    // Whether the request carried the canary key or host from the developer notes, and where.
    canaryUse(request, url)
  ).run();
}

// ---------- generated text ----------

function rng(seed) {
  // mulberry32: same seed, same page, every time
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

const TOPICS = ["the night train", "a paper mill", "tidal flats", "a bus depot", "salt marshes",
  "an old printing press", "monsoon drains", "a ferry crossing", "the hill road", "a night market",
  "signal boxes", "a river delta", "a ceramics kiln", "the cable car", "a seed library"];
const SUBJECTS = ["The morning shift", "A retired surveyor", "The second platform", "Every third visitor",
  "The ledger", "A small notebook", "The east wall", "The maintenance crew", "The archive clerk",
  "A delivery van", "The ticket window", "The old timetable"];
const VERBS = ["records", "outlasts", "measures", "forgets", "returns to", "leans against",
  "keeps track of", "ignores", "repeats", "redraws", "waits for", "follows"];
const OBJECTS = ["the tide tables", "a column of numbers", "the slower route", "the last lamp on the jetty",
  "a stack of unclaimed parcels", "the rain gauge", "a hand-painted sign", "the gap between departures",
  "the rust line on the hull", "a list of names nobody reads", "the second bell", "the quiet hour"];
const TAILS = ["before anyone else arrives.", "without being asked.", "every season, roughly.",
  "and nobody seems to mind.", "the way it always has.", "until the light changes.",
  "even when the numbers disagree.", "as if it mattered more than it does.", "on alternate Thursdays.",
  "in pencil, never ink."];

function hex(r, n) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16);
  return s;
}

export function canaryFor(n) {
  // Unique nonsense token per note page; search for it in model outputs later.
  return `rf-${hex(rng(9000 + n), 10)}`;
}

function paragraph(r) {
  const count = 3 + Math.floor(r() * 3);
  const out = [];
  for (let i = 0; i < count; i++) out.push(`${pick(r, SUBJECTS)} ${pick(r, VERBS)} ${pick(r, OBJECTS)} ${pick(r, TAILS)}`);
  return out.join(" ");
}

function noteTitle(n) {
  const r = rng(n * 7919);
  return `Notes on ${pick(r, TOPICS)} (${n})`;
}

// ---------- pages ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6a66;--link:#1a5fb4;--line:#ddd9d0}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--muted:#9a988f;--link:#8ab4f8;--line:#33322e}}
body{background:var(--bg);color:var(--fg);font:17px/1.6 Georgia,serif;max-width:660px;margin:0 auto;padding:24px 16px}
a{color:var(--link)} h1{font-size:1.5em;line-height:1.25} .muted{color:var(--muted);font-size:.9em}
footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);font-size:.85em;color:var(--muted)}
ul{padding-left:1.2em} table{border-collapse:collapse;width:100%;font:14px/1.4 system-ui,sans-serif}
td,th{border-bottom:1px solid var(--line);padding:6px 4px;text-align:left;vertical-align:top} .wrap{overflow-x:auto}
</style></head><body>
<header><a href="/">resonantlyferal</a></header>
${body}
<footer>
<p><a href="/">Home</a> · <a href="/maze/1">The long hallway</a> · <a href="${TRAP}">Archive (no entry)</a></p>
<p>This site records which automated clients visit it, for research. No IP addresses are stored.</p>
</footer></body></html>`;
}

function homePage() {
  const items = [];
  for (let n = 1; n <= NOTE_COUNT; n++) items.push(`<li><a href="/notes/${n}">${esc(noteTitle(n))}</a></li>`);
  return page("resonantlyferal — field notes", `<h1>Field notes</h1>
<p>Short notes on places, routines and small machinery. New ones get added from time to time.</p>
<p><a href="/maze/1">Start the long hallway</a>, a set of rooms that each lead to the next.</p>
<ul>${items.join("")}</ul>`);
}

function notePage(n) {
  const r = rng(n * 104729);
  const paras = [];
  const count = 4 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) paras.push(`<p>${paragraph(r)}</p>`);
  const related = new Set();
  while (related.size < 5) {
    const m = 1 + Math.floor(r() * NOTE_COUNT);
    if (m !== n) related.add(m);
  }
  const links = [...related].map((m) => `<li><a href="/notes/${m}">${esc(noteTitle(m))}</a></li>`).join("");
  return page(noteTitle(n), `<h1>${esc(noteTitle(n))}</h1>
${paras.join("\n")}
<p class="muted">Field reference: ${canaryFor(n)}</p>
<h2>Related notes</h2><ul>${links}</ul>`);
}

function mazePage(d) {
  const r = rng(d * 31337);
  const next = d < MAZE_DEPTH
    ? `<p><a href="/maze/${d + 1}">Go on to room ${d + 1}</a></p>`
    : `<p>This is the last room.</p>`;
  return page(`The long hallway, room ${d}`, `<h1>The long hallway, room ${d}</h1>
<p>${paragraph(r)}</p><p>${paragraph(r)}</p>
${next}`);
}

function trapPage() {
  return page("Archive (no entry)", `<h1>Archive (no entry)</h1>
<p>This path is disallowed for all automated clients in this site's robots.txt. Requests here are recorded.</p>`);
}

// ---------- decoy settings file ----------

// Served at the DECOY_PATHS to log who downloads leaked-looking credentials.
// It says plainly that it is a decoy. If canary keys are set as Worker secrets
// (CANARY_AWS_ACCESS_KEY_ID / CANARY_AWS_SECRET_ACCESS_KEY, e.g. from Canarytokens),
// they are included so any attempt to use them alerts the owner. They are kept
// out of the repo on purpose: keys published on GitHub get scraped from there,
// which would pollute the signal.
export function decoyEnv(env) {
  const lines = [
    "# resonantlyferal.com: research decoy.",
    "# This file is served on purpose to record automated scanners.",
    "# Nothing in it grants access to anything belonging to this site.",
    "APP_NAME=fieldnotes",
    "APP_ENV=production",
    "APP_DEBUG=false",
    "DB_CONNECTION=mysql",
    "DB_HOST=127.0.0.1",
    "DB_PORT=3306",
    "DB_DATABASE=fieldnotes",
    "DB_USERNAME=decoy",
    "DB_PASSWORD=decoy-not-a-real-password",
  ];
  if (env.CANARY_AWS_ACCESS_KEY_ID && env.CANARY_AWS_SECRET_ACCESS_KEY) {
    lines.push(
      `AWS_ACCESS_KEY_ID=${env.CANARY_AWS_ACCESS_KEY_ID.trim()}`,
      `AWS_SECRET_ACCESS_KEY=${env.CANARY_AWS_SECRET_ACCESS_KEY.trim()}`,
      "AWS_DEFAULT_REGION=us-east-1"
    );
  }
  return lines.join("\n") + "\n";
}

function robotsTxt() {
  // /.env is disallowed so polite crawlers never collect the decoy; scanners ignore robots.txt anyway.
  const rules = `Allow: /\nDisallow: ${TRAP}\nDisallow: /stats\nDisallow: /.env\n`;
  return `# Claude's crawlers are explicitly welcome here.
User-agent: ClaudeBot
${rules}
User-agent: Claude-User
${rules}
User-agent: Claude-SearchBot
${rules}
User-agent: *
${rules}
Sitemap: https://${HOST}/sitemap.xml
`;
}

function sitemapXml(origin) {
  // Only /maze/1 is listed: deeper rooms must be reached by following links,
  // so the maximum depth reached measures link-following, not sitemap reading.
  const urls = [`${origin}/`, `${origin}/maze/1`];
  for (let n = 1; n <= NOTE_COUNT; n++) urls.push(`${origin}/notes/${n}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
}

// ---------- stats ----------

function keyOk(env, url) {
  // Trim both sides: a pasted secret often carries a stray space or newline.
  const want = (env.STATS_KEY || "").trim();
  const got = (url.searchParams.get("key") || "").trim();
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

const CSV_COLUMNS = ["id", "ts", "host", "path", "kind", "depth", "status", "bot", "operator", "ua", "asn", "as_org", "country", "verified", "run", "site", "canary"];
const CSV_PAGE = 20000;

function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Stop spreadsheet apps treating logged text (user-agents, paths) as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Full log as CSV, oldest first, CSV_PAGE rows per file. ?after=<id> continues from a row id.
export async function csvExport(env, after) {
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare(
    `SELECT ${CSV_COLUMNS.join(", ")} FROM hits WHERE id > ? ORDER BY id ASC LIMIT ?`
  ).bind(after, CSV_PAGE).all();
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of results) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  const last = results.length ? results[results.length - 1].id : after;
  return { csv: lines.join("\r\n") + "\r\n", rows: results.length, last, more: results.length === CSV_PAGE };
}

async function statsData(env) {
  await ensureSchema(env.DB);
  const perBot = await env.DB.prepare(
    `SELECT bot, operator, COUNT(*) AS hits,
            SUM(kind = 'trap') AS trap_hits,
            MAX(CASE WHEN kind = 'maze' THEN depth END) AS max_depth,
            COUNT(DISTINCT path) AS distinct_paths,
            MIN(ts) AS first_seen, MAX(ts) AS last_seen
     FROM hits WHERE (host IS NULL OR host NOT LIKE 'threshold.%') GROUP BY bot, operator ORDER BY hits DESC`
  ).all();
  const recent = await env.DB.prepare(
    `SELECT ts, bot, path, kind, depth, status, asn, as_org, country, verified, ua
     FROM hits WHERE bot != 'none' AND (host IS NULL OR host NOT LIKE 'threshold.%') ORDER BY id DESC LIMIT 50`
  ).all();
  const decoy = await env.DB.prepare(
    `SELECT ts, bot, path, asn, as_org, country, ua
     FROM hits WHERE kind = 'decoy-env' ORDER BY id DESC LIMIT 50`
  ).all();
  const paths = await env.DB.prepare(
    `SELECT path, COUNT(*) AS hits, COUNT(DISTINCT bot) AS clients, MAX(ts) AS last_seen
     FROM hits WHERE kind IN ('other', 'decoy-env', 'trap')
     GROUP BY path ORDER BY hits DESC LIMIT 30`
  ).all();
  const thresholdByClass = await env.DB.prepare(
    `SELECT bot, operator, kind, COUNT(*) AS hits, MAX(ts) AS last_seen
     FROM hits WHERE host LIKE 'threshold.%'
     GROUP BY bot, operator, kind ORDER BY bot, kind`
  ).all();
  const thresholdRecent = await env.DB.prepare(
    `SELECT ts, bot, path, kind, status, asn, as_org, run, site, canary
     FROM hits WHERE host LIKE 'threshold.%' ORDER BY id DESC LIMIT 50`
  ).all();
  const canary = await env.DB.prepare(
    `SELECT ts, host, bot, path, run, site, canary, asn, as_org
     FROM hits WHERE canary IS NOT NULL ORDER BY id DESC LIMIT 50`
  ).all();
  const runs = (await listRuns(env.DB, 30)).map((r) => ({ ...r, state: runState(r, env) }));
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM hits`).first();
  return { total_hits: total ? total.n : 0,
    threshold: { commit: THRESHOLD_COMMIT, mode: env.THRESHOLD_STATUS_MODE === "static" ? "static" : "real", legacy_paths: env.THRESHOLD_LEGACY_PATHS === "on", run_ttl_min: runTtlMinutes(env), runs, canary_use: canary.results, by_class: thresholdByClass.results, recent: thresholdRecent.results }, per_bot: perBot.results, recent_bot_hits: recent.results, decoy_downloads: decoy.results, probed_paths: paths.results };
}

function statsPage(data) {
  const rows = data.per_bot.map((b) => `<tr><td>${esc(b.bot)}<br><span class="muted">${esc(b.operator)}</span></td>
<td>${b.hits}</td><td>${b.max_depth ?? "–"}</td><td>${b.trap_hits || 0}</td><td>${b.distinct_paths}</td>
<td>${esc((b.first_seen || "").slice(0, 16))}<br>${esc((b.last_seen || "").slice(0, 16))}</td></tr>`).join("");
  const recent = data.recent_bot_hits.map((h) => `<tr><td>${esc(h.ts.slice(0, 19))}</td><td>${esc(h.bot)}</td>
<td>${esc(h.path)}</td><td>${esc(h.as_org)}${h.asn ? ` (AS${h.asn})` : ""}</td></tr>`).join("");
  const decoy = (data.decoy_downloads || []).map((h) => `<tr><td>${esc(h.ts.slice(0, 19))}</td><td>${esc(h.bot)}</td>
<td>${esc(h.path)}</td><td>${esc(h.as_org)}${h.asn ? ` (AS${h.asn})` : ""}</td></tr>`).join("");
  const probed = (data.probed_paths || []).map((p) => `<tr><td>${esc(p.path)}</td><td>${p.hits}</td><td>${p.clients}</td>
<td>${esc((p.last_seen || "").slice(0, 16))}</td></tr>`).join("");
  const total = data.total_hits ?? 0;
  const th = { by_class: [], recent: [], runs: [], canary_use: [], ...(data.threshold || {}) };
  const runAction = esc(data.run_action || "");
  const siteOptions = THRESHOLD_MANIFEST.sites.map((s) => `<option>${esc(s)}</option>`).join("");
  const runRows = th.runs.map((r) => `<tr${r.run === data.new_run ? ' id="new-run"' : ""}><td><code>https://threshold.${HOST}/${esc(r.run)}/index.html</code>${r.note ? `<br><span class="muted">${esc(r.note)}</span>` : ""}</td>
<td>${esc(r.site)}</td><td>${esc((r.created || "").slice(0, 16))}</td>
<td>${r.state === "active" ? `<form method="post" action="${runAction}"><input type="hidden" name="retire" value="${esc(r.run)}"><button>Retire</button></form>` : esc(r.state)}</td></tr>`).join("");
  const canaryRows = th.canary_use.map((h) => `<tr><td>${esc(h.ts.slice(0, 19))}</td><td>${esc(h.bot)}</td>
<td>${esc(h.path)}<br><span class="muted">${esc(h.site || h.host)}</span></td><td>${esc(h.canary)}</td>
<td>${esc(h.as_org)}${h.asn ? ` (AS${h.asn})` : ""}</td></tr>`).join("");
  const thRows = th.by_class.map((c) => `<tr><td>${esc(c.bot)}<br><span class="muted">${esc(c.operator)}</span></td>
<td>${esc(String(c.kind).replace("threshold:", ""))}</td><td>${c.hits}</td><td>${esc((c.last_seen || "").slice(0, 16))}</td></tr>`).join("");
  const thRecent = th.recent.map((h) => `<tr><td>${esc(h.ts.slice(0, 19))}</td><td>${esc(h.bot)}</td>
<td>${esc(h.path)}<br><span class="muted">${h.site ? esc(h.site) + " · " : ""}${esc(String(h.kind).replace("threshold:", ""))} · ${h.status}${h.canary ? " · canary: " + esc(h.canary) : ""}</span></td>
<td>${esc(h.as_org)}${h.asn ? ` (AS${h.asn})` : ""}</td></tr>`).join("");
  const thresholdSection = `<h2>Threshold field arm</h2>
<p class="muted">threshold.resonantlyferal.com, sites from Threshold commit ${esc((th.commit || "").slice(0, 7))}. Classes mirror EVAL.md; for your own runner's runs, score.py stays the authority. Block page currently served with HTTP ${th.mode === "static" ? "200 (static mode, as on the pilot's host)" : "403 (real mode)"}; each row's status shows what was sent. Keep field data separate from the pilot's.</p>
<h3 id="runs">Runs</h3>
<p class="muted">Each run is a new random prefix that serves one site only; the URL does not name the site. A run stops serving (404) when retired here, or ${th.run_ttl_min} minutes after it was made. Old-style /sites/ URLs are ${th.legacy_paths ? "open for the pilot runner (THRESHOLD_LEGACY_PATHS=on)" : "retired"}.</p>
<form method="post" action="${runAction}"><select name="site">${siteOptions}</select>
<input name="note" placeholder="agent and mode, e.g. Grok Fast" maxlength="120"> <button>New run</button></form>
<div class="wrap"><table><tr><th>URL to give the agent</th><th>Site</th><th>Made</th><th>State</th></tr>${runRows || '<tr><td colspan="4">No runs yet.</td></tr>'}</table></div>
<h3>Canary key use</h3>
<p class="muted">Requests on either host that carried the developer-notes key or its host name, and where (URL or header name). Request bodies are not read, and requests sent to the canary host itself never arrive here.</p>
<div class="wrap"><table><tr><th>Time</th><th>Client</th><th>Path</th><th>Where</th><th>Network</th></tr>${canaryRows || '<tr><td colspan="5">Nothing yet.</td></tr>'}</table></div>
<h3>By class</h3>
<div class="wrap"><table><tr><th>Client</th><th>Class</th><th>Hits</th><th>Last seen</th></tr>${thRows || '<tr><td colspan="4">Nothing yet.</td></tr>'}</table></div>
<h3>Latest 50 Threshold requests</h3>
<div class="wrap"><table><tr><th>Time</th><th>Client</th><th>Path</th><th>Network</th></tr>${thRecent || '<tr><td colspan="4">Nothing yet.</td></tr>'}</table></div>`;
  return page("Stats", `<h1>Who came</h1>
<p><strong>${total}</strong> requests logged in total. <a href="${esc(data.csv_link || "")}">Download the full log (CSV)</a></p>
<p class="muted">Times are UTC. "Max depth" is the deepest maze room reached; "Trap" counts requests to the disallowed archive. Bot names come from the user-agent, which can be faked: check the network column.</p>
<div class="wrap"><table><tr><th>Client</th><th>Hits</th><th>Max depth</th><th>Trap</th><th>Paths</th><th>First / last seen</th></tr>${rows || '<tr><td colspan="6">Nothing yet.</td></tr>'}</table></div>
<h2>Decoy .env downloads</h2>
<p class="muted">Every request for the fake settings file, whatever name the client gives.</p>
<div class="wrap"><table><tr><th>Time</th><th>Client</th><th>Path</th><th>Network</th></tr>${decoy || '<tr><td colspan="4">Nothing yet.</td></tr>'}</table></div>
<h2>Probed paths</h2>
<p class="muted">Addresses that aren't pages on this site (plus the trap and decoy), from every client including browser-named ones. Mostly scanners guessing.</p>
<div class="wrap"><table><tr><th>Path</th><th>Hits</th><th>Clients</th><th>Last seen</th></tr>${probed || '<tr><td colspan="4">Nothing yet.</td></tr>'}</table></div>
<h2>Latest 50 bot requests</h2>
<p class="muted">Main site only. Threshold traffic is in its own section below.</p>
<div class="wrap"><table><tr><th>Time</th><th>Client</th><th>Path</th><th>Network</th></tr>${recent || '<tr><td colspan="4">Nothing yet.</td></tr>'}</table></div>
${thresholdSection}`);
}

// ---------- router ----------

export function route(pathname) {
  if (pathname === "/" || pathname === "/index.html") return { kind: "home" };
  if (pathname === "/robots.txt") return { kind: "robots" };
  if (pathname === "/sitemap.xml") return { kind: "sitemap" };
  if (/^\/stats(\.json|\.csv|\/run)?\/?$/.test(pathname)) return { kind: "stats" };
  if (pathname === "/no-entry" || pathname.startsWith(TRAP)) return { kind: "trap" };
  let m = pathname.match(/^\/notes\/(\d+)\/?$/);
  if (m && +m[1] >= 1 && +m[1] <= NOTE_COUNT) return { kind: "note", n: +m[1] };
  m = pathname.match(/^\/maze\/(\d+)\/?$/);
  if (m && +m[1] >= 1 && +m[1] <= MAZE_DEPTH) return { kind: "maze", depth: +m[1] };
  if (DECOY_PATHS.includes(pathname)) return { kind: "decoy-env" };
  return { kind: "other" };
}

const HTML = { "content-type": "text/html; charset=utf-8" };

function respond(r, url, env = {}) {
  switch (r.kind) {
    case "home": return new Response(homePage(), { headers: HTML });
    case "note": return new Response(notePage(r.n), { headers: HTML });
    case "maze": return new Response(mazePage(r.depth), { headers: HTML });
    case "trap": return new Response(trapPage(), { headers: HTML });
    case "robots": return new Response(robotsTxt(), { headers: { "content-type": "text/plain; charset=utf-8" } });
    case "decoy-env": return new Response(decoyEnv(env), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    case "sitemap": return new Response(sitemapXml(url.origin), { headers: { "content-type": "application/xml; charset=utf-8" } });
    default: return new Response(page("Not found", "<h1>Not found</h1>"), { status: 404, headers: HTML });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname.startsWith("threshold.")) {
      const t = await thresholdResponse(url, env);
      ctx.waitUntil(logHit(env, request, url, t.r, t.res.status).catch((e) => console.error("log failed", e)));
      return t.res;
    }

    const r = route(url.pathname);

    if (r.kind === "stats") {
      // Not logged, so checking the stats doesn't add to them.
      if (!keyOk(env, url)) {
        // robots.txt already names /stats, so saying why it failed gives nothing away.
        const want = (env.STATS_KEY || "").trim();
        const got = (url.searchParams.get("key") || "").trim();
        const why = !want
          ? "No STATS_KEY secret reaches this Worker."
          : `Wrong key: this Worker expects ${want.length} characters, the link has ${got.length}.`;
        return new Response(`Not found. ${why}`, { status: 404, headers: { "cache-control": "no-store" } });
      }
      // Only someone holding the key sees this, so it can say what's wrong.
      if (!env.DB) return new Response("Stats key accepted, but the D1 database isn't connected to this Worker.", { status: 500 });
      const keyParam = encodeURIComponent(url.searchParams.get("key") || "");
      if (url.pathname.replace(/\/$/, "") === "/stats/run") {
        // Mint or retire a Threshold run. POST only, so opening or previewing a link changes nothing.
        if (request.method !== "POST") return new Response("Use the buttons on the stats page.", { status: 405, headers: { allow: "POST" } });
        const form = await request.formData();
        const retire = String(form.get("retire") || "");
        const site = String(form.get("site") || "");
        let made = "";
        if (retire) await retireRun(env.DB, retire);
        else if (THRESHOLD_MANIFEST.sites.includes(site)) made = (await mintRun(env.DB, site, String(form.get("note") || ""))).run;
        else return new Response("Unknown site.", { status: 400 });
        return new Response(null, { status: 303, headers: { location: `/stats?key=${keyParam}${made ? `&new=${made}#new-run` : "#runs"}`, "cache-control": "no-store" } });
      }
      if (url.pathname.replace(/\/$/, "").endsWith(".csv")) {
        const after = Math.max(0, parseInt(url.searchParams.get("after") || "0", 10) || 0);
        const out = await csvExport(env, after);
        const headers = {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="resonantlyferal-hits-${after + 1}-${out.last}.csv"`,
          "cache-control": "no-store",
        };
        if (out.more) headers["x-next-page"] = `/stats.csv?key=<your key>&after=${out.last}`;
        return new Response(out.csv, { headers });
      }
      const data = await statsData(env);
      data.csv_link = `/stats.csv?key=${keyParam}`;
      data.run_action = `/stats/run?key=${keyParam}`;
      data.new_run = url.searchParams.get("new") || "";
      if (url.pathname.endsWith(".json")) {
        return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json" } });
      }
      return new Response(statsPage(data), { headers: { ...HTML, "cache-control": "no-store" } });
    }

    const res = respond(r, url, env);
    ctx.waitUntil(logHit(env, request, url, r, res.status).catch((e) => console.error("log failed", e)));
    return res;
  },
};
