const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8');

// replace ONLY the first occurrence of `))}` after `valid.map` with `})()}`
let idx = code.indexOf('return valid.map');
let endIdx = code.indexOf('))}', idx);

if (endIdx !== -1) {
  code = code.slice(0, endIdx) + '})()}' + code.slice(endIdx + 3);
  fs.writeFileSync('src/app/studio/content/page.tsx', code);
}
