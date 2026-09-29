const fs = require('fs');
let code = fs.readFileSync('src/lib/server/channelProvisioning.ts', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /const ROLE_TO_ORG_TYPE: Partial<Record<string, string>> = \{\n  creator: "creator",\n  business: "business",/,
  `const ROLE_TO_ORG_TYPE: Partial<Record<string, string>> = {
  viewer: "creator", // End Users get a creator channel for short clips
  creator: "creator",
  business: "business",`
);

fs.writeFileSync('src/lib/server/channelProvisioning.ts', code);
