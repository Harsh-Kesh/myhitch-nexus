require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query(`
    select a.full_name as account_name, p.name as profile_name, p.is_kids
    from accounts a
    left join account_profiles p on p.account_id = a.id
    where a.email = 'authz.creator1@nexus.test'
  `);
  console.table(res.rows);
  await client.end();
}
run();
