const fs = require('fs');
let code = fs.readFileSync('src/app/(public-video)/video/[id]/video-client.tsx', 'utf8');

code = code.replace(
  /onSubscribe,\s*\}: \{/,
  'onSubscribe,\n    onRentOrBuy,\n  }: {'
);

fs.writeFileSync('src/app/(public-video)/video/[id]/video-client.tsx', code);
