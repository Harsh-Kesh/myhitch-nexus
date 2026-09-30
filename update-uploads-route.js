const fs = require('fs');

let code = fs.readFileSync('src/app/api/studio/uploads/route.ts', 'utf8').replace(/\r\n/g, '\n');

// 1. Add listRealSubscriptions import
if (!code.includes('listRealSubscriptions')) {
  code = code.replace(
    'import { getRequestAccount } from "@/lib/server/rbac";',
    'import { getRequestAccount } from "@/lib/server/rbac";\nimport { listRealSubscriptions } from "@/lib/server/subscriptions";'
  );
}

// 2. Replace the maxDuration logic
const regex = /\/\/ Duration validation based on plan\/role[\s\S]+?if \(body\.durationSeconds !== undefined && body\.durationSeconds > maxDuration\) \{/m;

const replacement = `// Duration validation based on plan/role
  const isEndUser = account.roles.includes("viewer");
  let maxDuration = 600; // 10 mins for End User (viewer)

  if (!isEndUser) {
    const subs = await listRealSubscriptions(account.id);
    const hasPaidBusinessPlan = subs.some(s => s.status === "active" && (s.plan === "business" || s.plan === "enterprise"));
    maxDuration = hasPaidBusinessPlan ? Infinity : 1200; // Unlimited for Paid Business, 20 mins for Free Creator
  }

  if (body.durationSeconds !== undefined && body.durationSeconds > maxDuration) {`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/app/api/studio/uploads/route.ts', code);
