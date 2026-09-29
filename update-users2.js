const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/data/users.ts', 'utf8');

code = code.replace(
  /policy: emailOnly,\s*\}/g,
  `policy: emailOnly,
    "profile-created": inAppOnly,
    "profile-updated": inAppOnly,
    "profile-removed": inAppOnly,
    "settings-updated": inAppOnly,
    "account-registered": emailOnly,
    "subscription-updated": emailOnly,
  }`
);

fs.writeFileSync('src/lib/mock-api/data/users.ts', code);
