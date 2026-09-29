const fs = require('fs');
let code = fs.readFileSync('src/lib/server/analytics.ts', 'utf8');

const t3 = `      .map(([id, { revenueMinor, model }]) => ({
      videoId: id,
      title: viewsByVideoId.get(videoId)?.title ?? "Untitled",
      revenueMinor,
      views: viewsByVideoId.get(videoId)?.views ?? 0,
      model,
    }))`;

const r3 = `      .map(([id, { revenueMinor, model }]) => ({
      videoId: id,
      title: viewsByVideoId.get(id)?.title ?? "Untitled",
      revenueMinor,
      views: viewsByVideoId.get(id)?.views ?? 0,
      model,
    }))`;

const t3_crlf = t3.replace(/\n/g, '\r\n');
const r3_crlf = r3.replace(/\n/g, '\r\n');

code = code.replace(t3, r3).replace(t3_crlf, r3_crlf);

fs.writeFileSync('src/lib/server/analytics.ts', code);
