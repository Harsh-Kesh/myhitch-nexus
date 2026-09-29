const fs = require('fs');
let code = fs.readFileSync('src/lib/server/notifications.ts', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /if \(res\.rows\.length === 0\) return;\n\n    const prefs = res\.rows\[0\]\.notification_preferences \|\| \{\};/,
  `if (res.length === 0) return;\n\n    const prefs = res[0].notification_preferences || {};`
);

fs.writeFileSync('src/lib/server/notifications.ts', code);
