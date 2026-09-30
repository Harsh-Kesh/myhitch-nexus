const fs = require('fs');
let code = fs.readFileSync('src/app/(public-video)/video/[id]/video-client.tsx', 'utf8');
code = code.replace(/onSubscribe,\n  }: {/, 'onSubscribe,\n    onRentOrBuy,\n  }: {');
code = code.replace(/onSubscribe: \(plan: "premium" \| "family"\) => void;\n  }\) {/, 'onSubscribe: (plan: "premium" | "family") => void;\n    onRentOrBuy: (kind: "rent" | "buy") => void;\n  }) {');
fs.writeFileSync('src/app/(public-video)/video/[id]/video-client.tsx', code);
