const fs = require('fs');
let code = fs.readFileSync('src/lib/server/analytics.ts', 'utf8');

code = code.replace(/viewsByVideoId\.get\(videoId\)/g, 'viewsByVideoId.get(id)');

fs.writeFileSync('src/lib/server/analytics.ts', code);
