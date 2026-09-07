import fs from "fs";
import pg from "pg";
import crypto from "crypto";

const BASE = "https://1949.top";
const pack = JSON.parse(fs.readFileSync("/tmp/grok-pack.bin", "utf8"));
if (pack.kind !== "fengkou.profile-pack" || !pack.desk) {
  console.error("bad pack kind");
  process.exit(1);
}
const desk = pack.desk;
const username = "熊猫";
const displayName = "熊猫";
const email = `xiongmao${Date.now()}@1949.top`;
const password = "PandaImport123";

// signup
const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email, password, name: displayName }),
});
const suBody = await su.json();
console.log("signup", su.status, suBody.user?.id ? "user_ok" : JSON.stringify(suBody).slice(0, 200));
if (!su.ok || !suBody.user?.id) process.exit(1);
const userId = suBody.user.id;

// load DATABASE_URL
const env = fs.readFileSync("/tmp/fengkou-env.local", "utf8");
const m = env.match(/^DATABASE_URL=(.*)$/m);
if (!m) throw new Error("no DATABASE_URL");
let databaseUrl = m[1].trim();
if ((databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) || (databaseUrl.startsWith("'") && databaseUrl.endsWith("'"))) {
  databaseUrl = databaseUrl.slice(1, -1);
}
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const usernameKey = username.toLowerCase();
// clear conflicting username if another user holds it
await client.query(
  `update profiles set username = username || '_old_' || substr(md5(random()::text),1,6),
    username_key = username_key || '_old_' || substr(md5(random()::text),1,6)
   where username_key = $1 and user_id <> $2`,
  [usernameKey, userId],
);

await client.query(
  `insert into profiles (user_id, username, username_key, display_name, updated_at)
   values ($1, $2, $3, $4, now())
   on conflict (user_id) do update set
     username = excluded.username,
     username_key = excluded.username_key,
     display_name = excluded.display_name,
     updated_at = now()`,
  [userId, username, usernameKey, displayName],
);

const bookScope = desk.bookScope === "custom" ? "custom" : "all";
const bookSymbols = Array.isArray(desk.bookSymbols) ? desk.bookSymbols : [];
await client.query(
  `insert into desks (user_id, symbols, selected, board, notes, analyses, trades, book_analysis, book_scope, book_symbols, updated_at)
   values ($1, $2::jsonb, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10::jsonb, now())
   on conflict (user_id) do update set
     symbols = excluded.symbols,
     selected = excluded.selected,
     board = excluded.board,
     notes = excluded.notes,
     analyses = excluded.analyses,
     trades = excluded.trades,
     book_analysis = excluded.book_analysis,
     book_scope = excluded.book_scope,
     book_symbols = excluded.book_symbols,
     updated_at = now()`,
  [
    userId,
    JSON.stringify(desk.symbols ?? []),
    desk.selected ?? "",
    desk.board === "crypto" ? "crypto" : "equity",
    JSON.stringify(desk.notes ?? {}),
    JSON.stringify(desk.analyses ?? {}),
    JSON.stringify(desk.trades ?? []),
    desk.bookAnalysis == null ? null : JSON.stringify(desk.bookAnalysis),
    bookScope,
    JSON.stringify(bookSymbols),
  ],
);

const check = await client.query(
  `select p.username, p.display_name, jsonb_array_length(d.symbols) as n_symbols,
          (select count(*) from jsonb_object_keys(d.analyses)) as n_analyses
   from profiles p join desks d on d.user_id = p.user_id where p.user_id = $1`,
  [userId],
);
console.log("imported", JSON.stringify(check.rows[0]));
console.log("login_email", email);
console.log("login_password", password);
await client.end();
