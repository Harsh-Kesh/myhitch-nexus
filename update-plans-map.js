const fs = require('fs');
let code = fs.readFileSync('src/app/(public)/plans/plans-client.tsx', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(/\{PLANS\.map\(\(plan\) => \{/g, '{filteredPlans.map((plan) => {');

fs.writeFileSync('src/app/(public)/plans/plans-client.tsx', code);
