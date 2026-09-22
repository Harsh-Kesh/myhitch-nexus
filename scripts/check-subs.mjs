import { Client } from "pg";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

const acc = await pg.query("select id, email from accounts where email = 'mara@marasolace.example'");
console.log("Account:", acc.rows[0]);

if (acc.rows[0]) {
  const subs = await pg.query("select * from subscriptions where account_id = $1", [acc.rows[0].id]);
  console.log("Subs:", subs.rows);
}

await pg.end();
