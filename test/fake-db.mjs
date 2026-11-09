// A stand-in for the D1 binding: remembers log inserts and keeps the Threshold run registry in memory.
export function fakeDB() {
  const inserts = [];
  const runs = new Map();
  return {
    inserts,
    runs,
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) { this.args = args; return this; },
        async run() {
          if (/^\s*INSERT INTO hits/i.test(sql)) inserts.push(this.args);
          else if (/^\s*INSERT INTO threshold_runs/i.test(sql)) {
            const [run, site, created, note] = this.args;
            if (runs.has(run)) throw new Error("UNIQUE constraint failed");
            runs.set(run, { run, site, created, retired: null, note });
          } else if (/^\s*UPDATE threshold_runs SET retired/i.test(sql)) {
            const [retired, run] = this.args;
            const row = runs.get(run);
            if (row && !row.retired) row.retired = retired;
          }
          return {};
        },
        async all() {
          if (/FROM threshold_runs/i.test(sql)) return { results: [...runs.values()].sort((a, b) => b.created.localeCompare(a.created)) };
          return { results: [] };
        },
        async first() {
          if (/FROM threshold_runs WHERE run = \?/i.test(sql)) return runs.get(this.args[0]) || null;
          return { n: 0 };
        },
      };
    },
    async batch(stmts) { return stmts.map(() => ({})); },
  };
}
