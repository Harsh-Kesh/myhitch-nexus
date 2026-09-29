const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
const match = code.match(/export async function getCurrentUser\(\)[\s\S]*?return clone\(store\.user\);\n  }/);
if (match) console.log(match[0]);
else console.log("Not found");
