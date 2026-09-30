const fs = require('fs');

let vc = fs.readFileSync('src/app/(public-video)/video/[id]/video-client.tsx', 'utf8').replace(/\r\n/g, '\n');

// Add onRentOrBuy to destructured props
vc = vc.replace(
  /loading,\n    onSubscribe,\n  }: {/,
  'loading,\n    onSubscribe,\n    onRentOrBuy,\n  }: {'
);

// Add onRentOrBuy to type definition
vc = vc.replace(
  /onSubscribe: \(plan: "premium" \| "family"\) => void;\n  }\) {/,
  'onSubscribe: (plan: "premium" | "family") => void;\n    onRentOrBuy: (kind: "rent" | "buy") => Promise<void> | void;\n  }) {'
);

fs.writeFileSync('src/app/(public-video)/video/[id]/video-client.tsx', vc);
