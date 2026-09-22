import { Client } from "pg";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

const subs = await pg.query("select * from subscriptions");
console.log("All Subs:", subs.rows);

const accs = await pg.query("select id, email from accounts");
console.log("All Accounts:", accs.rows);

await pg.end();
