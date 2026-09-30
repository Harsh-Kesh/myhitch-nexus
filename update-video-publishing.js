const fs = require('fs');

let code = fs.readFileSync('src/lib/server/videoPublishing.ts', 'utf8').replace(/\r\n/g, '\n');

const regex = /\/\/ Duration validation\n\s*const roleRows = await query<\{ role: string \}>\(`select role from account_roles where account_id = \$1`, \[accountId\]\);\n\s*const isBusinessTrack = roleRows\.some\(\(r\) => \["business", "creator", "enterprise"\]\.includes\(r\.role\)\);\n\s*const maxDuration = isBusinessTrack \? 1800 : 600;/m;

const replacement = `// Duration validation
  const roleRows = await query<{ role: string }>(\`select role from account_roles where account_id = $1\`, [accountId]);
  const isEndUser = roleRows.some((r) => r.role === "viewer");
  let maxDuration = 600;

  if (!isEndUser) {
    const subsRows = await query<{ plan: string }>(\`select plan from subscriptions where account_id = $1 and status = 'active'\`, [accountId]);
    const hasPaidBusinessPlan = subsRows.some(s => s.plan === "business" || s.plan === "enterprise");
    maxDuration = hasPaidBusinessPlan ? Infinity : 1200;
  }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/lib/server/videoPublishing.ts', code);
