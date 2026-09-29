const { Client } = require('pg');
async function run() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const res = await pg.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log(res.rows.map(r => r.table_name).join(', '));
  await pg.end();
}
run();
