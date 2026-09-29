const fs = require('fs');
let code = fs.readFileSync('src/lib/server/commerce.ts', 'utf8');

code = code.replace(
  /typeof session.payment_intent === "string" \? session.payment_intent : \(session.payment_intent\?\.id \?\? null\),\s*expiresAt,\s*],\s*\);\s*}/m,
  `typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
        expiresAt,
      ],
    );

    await emitNotification(
      accountId,
      "purchase-receipt",
      kind === "rent" ? "Video Rental Confirmed" : "Video Purchase Confirmed",
      kind === "rent" ? "Your rental window begins when you start playback." : "Thank you for your purchase.",
      "/video/" + videoId
    );
  }`
);

fs.writeFileSync('src/lib/server/commerce.ts', code);
