# bot-crawler-b8

A bait site at **resonantlyferal.com** that records which automated clients visit it, how deep they follow links, and whether they respect robots.txt.

It runs as one Cloudflare Worker with a small D1 database for the log. No GitHub Pages: GitHub Pages can't see requests, a Worker can.

## What's on the site

| Path | What it is | What it measures |
|---|---|---|
| `/` | Home page linking every note and the maze | Discovery |
| `/notes/1` … `/notes/60` | Generated bait pages. Each carries a unique canary token (`rf-` + 10 hex characters) | Crawl breadth; canaries can be searched for in model output later |
| `/maze/1` … `/maze/50` | The long hallway: each room links only to the next | Maximum depth each client follows |
| `/no-entry/` | Trap. Disallowed for every client in robots.txt, linked visibly in every footer | Which clients ignore robots.txt |
| `/.env` (and `.env.local`, `.env.production`, `.env.bak`, `.env.backup`) | Decoy settings file. Says in its first line that it is a research decoy; holds no real credentials. Disallowed in robots.txt so polite crawlers never collect it | Which scanners download leaked-looking credentials |
| `/robots.txt` | Explicitly allows ClaudeBot, Claude-User and Claude-SearchBot; disallows the trap for everyone | |
| `/sitemap.xml` | Home, all notes, and `/maze/1` only | Deeper rooms must be reached by following links, so depth measures link-following, not sitemap reading |
| `/stats?key=…` | Private stats page (`/stats.json` for raw numbers). Never logged | |

Every page says in its footer that the site records automated visitors. Nothing on the site is hidden from human visitors.

## What gets logged

Per request: time (UTC), host, path, page kind, maze depth, status, bot name and operator (from the user-agent), the full user-agent, network (ASN and organisation), country, and Cloudflare's verified-bot flag where the plan exposes it.

**No IP addresses are stored.**

**User-agents can be faked.** Anyone can call themselves ClaudeBot. Cloudflare's verified-bot flag needs a Bot Management plan, so on the free plan that column stays empty; the network column is the sanity check instead (a "ClaudeBot" coming from a home broadband network is almost certainly not Anthropic).

## Setup (Cloudflare dashboard, works from a laptop browser)

1. **Let AI crawlers in.** Domain `resonantlyferal.com` → AI Crawl Control (or Security → Bots): set AI crawlers to allowed and turn off any Cloudflare-managed robots.txt, so this Worker's robots.txt is the one bots read.
2. **Create the database.** Done: `bot-crawler-b8`, ID already in `wrangler.toml`.
3. **Deploy from GitHub.** Workers & Pages → Create → Import a repository → pick `Resonantly-Feral/Bot-crawler-b8`. Deploy. The `routes` entry attaches it to `resonantlyferal.com` and creates the DNS record. The log table creates itself on the first request.
4. **Set the stats key.** Worker → Settings → Variables and secrets → add a **secret** named `STATS_KEY` with a long random value. Then open `https://resonantlyferal.com/stats?key=<that value>`.

After that, every commit to `main` redeploys.

## Getting found

Bots find sites by following links from pages they already crawl. Link `https://resonantlyferal.com` from places that get crawled often: this repo's description, your GitHub profile, a LinkedIn post. A new site can sit quiet for days or weeks before a given bot arrives; that wait is part of what the log shows.

## Optional: canary keys in the decoy

To learn whether anyone tries to *use* the decoy, add fake cloud keys that report back when used:

1. Make an AWS API key token at canarytokens.org (free; alerts go to the email you give it).
2. Worker → Settings → Variables and Secrets (the runtime one, not Build) → add two **secrets**: `CANARY_AWS_ACCESS_KEY_ID` and `CANARY_AWS_SECRET_ACCESS_KEY`.

They appear in `/.env` only while those secrets exist. Never commit them: keys published on GitHub get scraped from GitHub itself, which would muddy what the alert means.

## Tests

```
npm test
```

Runs against a fake database; no Cloudflare account or network needed.

## Threshold field arm

`threshold.resonantlyferal.com` serves the six [Threshold](https://github.com/Resonantly-Feral/threshold) test sites (Agent Boundary Notice conditions A/B/C × alt/noalt) at `/sites/<site>/<page>`, so agents can meet the notice on a real host.

- **Unchanged pages.** `scripts/sync-threshold.mjs` copies the HTML and `manifest.json` byte for byte from a Threshold checkout into `src/threshold-sites.js`, recording the source commit. Responses carry it in an `x-threshold-commit` header. Re-sync after any Threshold change: `node scripts/sync-threshold.mjs ../threshold`.
- **Real 403.** The block page (`visitor-stats.html`, any query string) is sent with HTTP 403; the pilot serves 200 and its runner emulates 403. `THRESHOLD_STATUS_MODE` in `wrangler.toml` switches it: `"real"` sends 403, `"static"` sends 200 like the pilot's host. Switching is a commit, so mode changes are timestamped, and the log's blocked_route rows record the status actually sent. First field run (05/11/2026, real 403): Claude's web fetch dropped the 403 body and showed the model its own error instead, so the notice never reached it. Currently: `static`. Either way, **keep field-arm data separate from pilot data.**
- **Run prefixes.** The same files are also served under `/<run>/sites/<site>/<page>` (run = lowercase letters, digits and hyphens, up to 32). The pages link relatively, so every link resolves to a URL no tool has fetched before. Needed because Claude's web fetch caches a failed fetch across conversations: after one real 403 on `/sites/B-noalt/visitor-stats.html`, later runs got the same error with no request reaching the server (05/11/2026). Use a new prefix per run, e.g. `/r2/sites/B-noalt/index.html`; the log's path column records it.
- **Kept away from crawlers.** Not linked from the main site; `/` returns 404. Its robots.txt disallows training, search and archive crawlers by name, but deliberately does not name per-user agent fetchers (Claude-User, ChatGPT-User, Perplexity-User), which a field run needs. Every response also sends `X-Robots-Tag: noindex, nofollow, noarchive`, on top of the pages' own meta tag.
- **Logged with classes from EVAL.md** (`public_page`, `blocked_route`, `authorized_alt`, `restricted_backdoor`, `unlisted_path`), shown in their own section of the stats page. These label traffic the pilot runner didn't send; for runner runs, `runner/score.py` stays the authority. The runner's user-agent (`abn-pilot`) is recognised by name.
- **Pointing the runner here:** `python run_pilot.py --base-url https://threshold.resonantlyferal.com/sites`. Its allowlist keeps the agent on this host.
- **May still be found.** The new hostname's HTTPS certificate can appear in public certificate logs, which scanners watch, so expect some scanner traffic; it lands in `unlisted_path`.
