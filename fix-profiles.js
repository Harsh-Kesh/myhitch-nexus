const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8');

code = code.replace(
  /} as ViewerProfile\)\);/g,
  `} as any));`
);

code = code.replace(
  /} as any\)\);/g,
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any\n            } as any));`
);

fs.writeFileSync('src/lib/mock-api/index.ts', code);
