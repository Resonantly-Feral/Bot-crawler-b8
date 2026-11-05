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
2. **Create the database.** Storage & databases → D1 → Create → name it `bot-crawler-b8`. Copy its Database ID.
3. **Paste the ID.** In this repo on GitHub, edit `wrangler.toml` and replace `PASTE_YOUR_D1_DATABASE_ID_HERE` with it. Commit.
4. **Deploy from GitHub.** Workers & Pages → Create → Import a repository → pick `Resonantly-Feral/Bot-crawler-b8`. Deploy. The `routes` entry attaches it to `resonantlyferal.com` and creates the DNS record. The log table creates itself on the first request.
5. **Set the stats key.** Worker → Settings → Variables and secrets → add a **secret** named `STATS_KEY` with a long random value. Then open `https://resonantlyferal.com/stats?key=<that value>`.

After that, every commit to `main` redeploys.

## Getting found

Bots find sites by following links from pages they already crawl. Link `https://resonantlyferal.com` from places that get crawled often: this repo's description, your GitHub profile, a LinkedIn post. A new site can sit quiet for days or weeks before a given bot arrives; that wait is part of what the log shows.

## Tests

```
npm test
```

Runs against a fake database; no Cloudflare account or network needed.

## Not yet included

The Threshold (Agent Boundary Notice) field arm. It will go on its own subdomain, unlinked from the bait pages, with robots.txt turning training crawlers away there, so the test sites aren't collected into training data before they're used. Data served from this Worker (with a real HTTP 403) is kept separate from the pilot's data.
