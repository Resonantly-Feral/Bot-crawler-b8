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
//
// Every request except /stats is logged to D1. No IP addresses are stored.

const HOST = "resonantlyferal.com";
const NOTE_COUNT = 60;
const MAZE_DEPTH = 50;
const TRAP = "/no-entry/";

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
  ["other-bot", /bot|crawl|spider|scrape|fetch|python|curl|wget|headless|httpclient|go-http|java\//i, "unknown"],
];

export function classifyAgent(ua) {
  if (!ua) return { bot: "no-user-agent", operator: "unknown" };
  for (const [name, re, operator] of BOTS) if (re.test(ua)) return { bot: name, operator };
  return { bot: "none", operator: "" };
}

// ---------- logging ----------

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL,
     host TEXT, path TEXT, kind TEXT, depth INTEGER, status INTEGER,
     bot TEXT, operator TEXT, ua TEXT,
     asn INTEGER, as_org TEXT, country TEXT, verified TEXT)`,
  `CREATE INDEX IF NOT EXISTS hits_bot ON hits(bot)`,
  `CREATE INDEX IF NOT EXISTS hits_ts ON hits(ts)`,
];
let schemaReady = false;

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaReady = true;
}

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
    `INSERT INTO hits (ts, host, path, kind, depth, status, bot, operator, ua, asn, as_org, country, verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    new Date().toISOString(), url.hostname, (url.pathname + url.search).slice(0, 500),
    route.kind, route.depth ?? null, status, bot, operator, ua.slice(0, 500),
    cf.asn ?? null, cf.asOrganization ?? null, cf.country ?? null, verified
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

function robotsTxt() {
  const rules = `Allow: /\nDisallow: ${TRAP}\nDisallow: /stats\n`;
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
  const want = env.STATS_KEY;
  const got = url.searchParams.get("key") || "";
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

async function statsData(env) {
  await ensureSchema(env.DB);
  const perBot = await env.DB.prepare(
    `SELECT bot, operator, COUNT(*) AS hits,
            SUM(kind = 'trap') AS trap_hits,
            MAX(CASE WHEN kind = 'maze' THEN depth END) AS max_depth,
            COUNT(DISTINCT path) AS distinct_paths,
            MIN(ts) AS first_seen, MAX(ts) AS last_seen
     FROM hits GROUP BY bot, operator ORDER BY hits DESC`
  ).all();
  const recent = await env.DB.prepare(
    `SELECT ts, bot, path, kind, depth, status, asn, as_org, country, verified, ua
     FROM hits WHERE bot != 'none' ORDER BY id DESC LIMIT 50`
  ).all();
  return { per_bot: perBot.results, recent_bot_hits: recent.results };
}

function statsPage(data) {
  const rows = data.per_bot.map((b) => `<tr><td>${esc(b.bot)}<br><span class="muted">${esc(b.operator)}</span></td>
<td>${b.hits}</td><td>${b.max_depth ?? "–"}</td><td>${b.trap_hits || 0}</td><td>${b.distinct_paths}</td>
<td>${esc((b.first_seen || "").slice(0, 16))}<br>${esc((b.last_seen || "").slice(0, 16))}</td></tr>`).join("");
  const recent = data.recent_bot_hits.map((h) => `<tr><td>${esc(h.ts.slice(0, 19))}</td><td>${esc(h.bot)}</td>
<td>${esc(h.path)}</td><td>${esc(h.as_org)}${h.asn ? ` (AS${h.asn})` : ""}</td></tr>`).join("");
  return page("Stats", `<h1>Who came</h1>
<p class="muted">Times are UTC. "Max depth" is the deepest maze room reached; "Trap" counts requests to the disallowed archive. Bot names come from the user-agent, which can be faked: check the network column.</p>
<div class="wrap"><table><tr><th>Client</th><th>Hits</th><th>Max depth</th><th>Trap</th><th>Paths</th><th>First / last seen</th></tr>${rows || '<tr><td colspan="6">Nothing yet.</td></tr>'}</table></div>
<h2>Latest 50 bot requests</h2>
<div class="wrap"><table><tr><th>Time</th><th>Client</th><th>Path</th><th>Network</th></tr>${recent || '<tr><td colspan="4">Nothing yet.</td></tr>'}</table></div>`);
}

// ---------- router ----------

export function route(pathname) {
  if (pathname === "/" || pathname === "/index.html") return { kind: "home" };
  if (pathname === "/robots.txt") return { kind: "robots" };
  if (pathname === "/sitemap.xml") return { kind: "sitemap" };
  if (pathname === "/stats" || pathname === "/stats.json") return { kind: "stats" };
  if (pathname === "/no-entry" || pathname.startsWith(TRAP)) return { kind: "trap" };
  let m = pathname.match(/^\/notes\/(\d+)\/?$/);
  if (m && +m[1] >= 1 && +m[1] <= NOTE_COUNT) return { kind: "note", n: +m[1] };
  m = pathname.match(/^\/maze\/(\d+)\/?$/);
  if (m && +m[1] >= 1 && +m[1] <= MAZE_DEPTH) return { kind: "maze", depth: +m[1] };
  return { kind: "other" };
}

const HTML = { "content-type": "text/html; charset=utf-8" };

function respond(r, url) {
  switch (r.kind) {
    case "home": return new Response(homePage(), { headers: HTML });
    case "note": return new Response(notePage(r.n), { headers: HTML });
    case "maze": return new Response(mazePage(r.depth), { headers: HTML });
    case "trap": return new Response(trapPage(), { headers: HTML });
    case "robots": return new Response(robotsTxt(), { headers: { "content-type": "text/plain; charset=utf-8" } });
    case "sitemap": return new Response(sitemapXml(url.origin), { headers: { "content-type": "application/xml; charset=utf-8" } });
    default: return new Response(page("Not found", "<h1>Not found</h1>"), { status: 404, headers: HTML });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const r = route(url.pathname);

    if (r.kind === "stats") {
      // Not logged, so checking the stats doesn't add to them.
      if (!keyOk(env, url) || !env.DB) return new Response("Not found", { status: 404 });
      const data = await statsData(env);
      if (url.pathname.endsWith(".json")) {
        return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json" } });
      }
      return new Response(statsPage(data), { headers: { ...HTML, "cache-control": "no-store" } });
    }

    const res = respond(r, url);
    ctx.waitUntil(logHit(env, request, url, r, res.status).catch((e) => console.error("log failed", e)));
    return res;
  },
};
