const fs = require('fs');
let code = fs.readFileSync('src/lib/server/subscriptions.ts', 'utf8');

code = code.replace(
  /\s*\],\s*\);\s*\/\/\s*Enterprise-only/g,
  `\n      ],\n    );\n\n    await emitNotification(\n      accountId,\n      'subscription-updated',\n      'Subscription Updated',\n      \`Your subscription to the \${plan} plan has been successfully updated.\`,\n      '/business/billing'\n    );\n\n    // Enterprise-only`
);

fs.writeFileSync('src/lib/server/subscriptions.ts', code);
