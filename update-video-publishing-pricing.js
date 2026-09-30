const fs = require('fs');

let code = fs.readFileSync('src/lib/server/videoPublishing.ts', 'utf8').replace(/\r\n/g, '\n');

const regex = /const isEndUser = roleRows\.some\(\(r\) => r\.role === "viewer"\);\n\s*let maxDuration = 600;\n\n\s*if \(!isEndUser\) \{\n\s*const subsRows = await query<\{ plan: string \}>\(`select plan from subscriptions where account_id = \$1 and status = 'active'`, \[accountId\]\);\n\s*const hasPaidBusinessPlan = subsRows\.some\(s => s\.plan === "business" \|\| s\.plan === "enterprise"\);\n\s*maxDuration = hasPaidBusinessPlan \? Infinity : 1200;\n\s*\}/m;

const replacement = `const isEndUser = roleRows.some((r) => r.role === "viewer");
  let maxDuration = 600;
  let hasPaidBusinessPlan = false;

  if (!isEndUser) {
    const subsRows = await query<{ plan: string }>(\`select plan from subscriptions where account_id = $1 and status = 'active'\`, [accountId]);
    hasPaidBusinessPlan = subsRows.some(s => s.plan === "business" || s.plan === "enterprise");
    maxDuration = hasPaidBusinessPlan ? Infinity : 1200;
  }
  
  if (!hasPaidBusinessPlan && (input.pricing?.rentPrice || input.pricing?.buyPrice || input.pricing?.accessModels?.includes('rent') || input.pricing?.accessModels?.includes('buy'))) {
    return { outcome: "invalid", reason: "Setting a Rent or Buy price requires an active paid Business or Enterprise plan." };
  }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/lib/server/videoPublishing.ts', code);
