const fs = require('fs');
let code = fs.readFileSync('src/app/auth/register/page.tsx', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(/IconMovie,\n/g, '');
code = code.replace(/IconVideo,\n/g, '');

fs.writeFileSync('src/app/auth/register/page.tsx', code);
