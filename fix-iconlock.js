const fs = require('fs');

let code = fs.readFileSync('src/app/studio/upload/page.tsx', 'utf8').replace(/\r\n/g, '\n');

if (!code.includes('IconLock,')) {
  code = code.replace(
    /IconSparkles,/,
    'IconLock,\n  IconSparkles,'
  );
}

fs.writeFileSync('src/app/studio/upload/page.tsx', code);
