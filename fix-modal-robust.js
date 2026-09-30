const fs = require('fs');
let code = fs.readFileSync('src/app/(public-video)/video/[id]/video-client.tsx', 'utf8');

// Replace the line directly regardless of line endings
code = code.replace(
  /onSubscribe: \(plan: "premium" \| "family"\) => void;/g,
  'onSubscribe: (plan: "premium" | "family") => void;\n    onRentOrBuy: (kind: "rent" | "buy") => void;'
);

code = code.replace(
  /onSubscribe,\n  }: {/g,
  'onSubscribe,\n    onRentOrBuy,\n  }: {'
);

// Fallback if the second replace fails because of \r\n
code = code.replace(
  /onSubscribe,\r\n  }: {/g,
  'onSubscribe,\r\n    onRentOrBuy,\r\n  }: {'
);

fs.writeFileSync('src/app/(public-video)/video/[id]/video-client.tsx', code);
