const fs = require('fs');
let code = fs.readFileSync('src/app/(public)/account/notifications/page.tsx', 'utf8');

code = code.replace(
  /const prefs = user\.notificationPreferences\[event\];/g,
  `const prefs = user.notificationPreferences[event] || { inApp: true, email: true, push: false };`
);

fs.writeFileSync('src/app/(public)/account/notifications/page.tsx', code);
