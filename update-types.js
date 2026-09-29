const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/types.ts', 'utf8');

code = code.replace(
  /export type NotificationEvent =[\s\S]*?\| "policy";/,
  `export type NotificationEvent =
  | "new-upload"
  | "live-starting"
  | "reply"
  | "mention"
  | "purchase-receipt"
  | "rental-expiring"
  | "payout"
  | "policy"
  | "profile-created"
  | "profile-updated"
  | "profile-removed"
  | "settings-updated"
  | "account-registered"
  | "subscription-updated";`
);

fs.writeFileSync('src/lib/mock-api/types.ts', code);
