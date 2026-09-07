import fs from "fs";
import pg from "pg";
const bk = process.argv[2];
if (!bk) throw new Error("usage: backup-db-json.mjs <backup-dir>");
const env = fs.readFileSync("/tmp/fengkou-env.local", "utf8");
const m = env.match(/^DATABASE_URL=(.*)$/m);
if (!m) throw new Error("no DATABASE_URL");
let url = m[1].trim();
if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) url = url.slice(1, -1);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const tables = await client.query(`select tablename from pg_tables where schemaname='public' order by 1`);
const summary = [];
for (const { tablename } of tables.rows) {
  const count = await client.query(`select count(*)::int as n from "${tablename}"`);
  const rows = await client.query(`select * from "${tablename}"`);
  fs.writeFileSync(`${bk}/table-${tablename}.json`, JSON.stringify(rows.rows));
  summary.push(`${tablename}\t${count.rows[0].n}`);
}
fs.writeFileSync(`${bk}/tables.txt`, summary.join("\n") + "\n");
fs.appendFileSync(`${bk}/db-dump-status.txt`, `\nJSON dumps: ${tables.rows.length} tables\n${summary.join("\n")}\n`);
await client.end();
console.log(summary.join("\n"));
