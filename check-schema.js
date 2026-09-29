const { Client } = require('pg');
async function run() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  
  const tables = ['watch_progress', 'account_profiles', 'accounts'];
  
  for (const table of tables) {
    console.log(`\n--- ${table} ---`);
    const res = await pg.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = '${table}'
    `);
    console.log(res.rows.map(r => `${r.column_name}: ${r.data_type}`).join('\n'));
  }
  
  await pg.end();
}
run();
