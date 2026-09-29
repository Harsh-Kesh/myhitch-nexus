const fs = require('fs');
let code = fs.readFileSync('src/components/layout/site-header.tsx', 'utf8');

const regex = /\{hasFamilyPlan && user\.profiles\.length > 1 \? \([\s\S]*?\) : null\}/;
code = code.replace(regex, '');

fs.writeFileSync('src/components/layout/site-header.tsx', code);
