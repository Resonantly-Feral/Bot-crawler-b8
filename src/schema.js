// D1 schema, shared by the logger (worker.js) and the Threshold run registry (threshold.js).
// Tables create themselves on the first request; columns added later are added in place.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL,
     host TEXT, path TEXT, kind TEXT, depth INTEGER, status INTEGER,
     bot TEXT, operator TEXT, ua TEXT,
     asn INTEGER, as_org TEXT, country TEXT, verified TEXT,
     run TEXT, site TEXT, canary TEXT)`,
  `CREATE INDEX IF NOT EXISTS hits_bot ON hits(bot)`,
  `CREATE INDEX IF NOT EXISTS hits_ts ON hits(ts)`,
  // One row per Threshold field run: the random prefix, the one site it serves, and when it stopped.
  `CREATE TABLE IF NOT EXISTS threshold_runs (
     run TEXT PRIMARY KEY,
     site TEXT NOT NULL,
     created TEXT NOT NULL,
     retired TEXT,
     note TEXT)`,
];

// Columns added to hits after the first deploy. A log table created before them gets them here.
const ADDED_HITS_COLUMNS = ["run", "site", "canary"];

let schemaReady = false;

export async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  let have = null;
  try {
    const { results } = await db.prepare(`PRAGMA table_info(hits)`).all();
    if (results && results.length) have = new Set(results.map((c) => c.name));
  } catch {
    // Fall through: try each column and let "duplicate column" errors pass.
  }
  for (const col of ADDED_HITS_COLUMNS) {
    if (have && have.has(col)) continue;
    try {
      await db.prepare(`ALTER TABLE hits ADD COLUMN ${col} TEXT`).run();
    } catch {
      // Already there.
    }
  }
  schemaReady = true;
}
