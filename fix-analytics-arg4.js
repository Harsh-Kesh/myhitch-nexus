const fs = require('fs');
let code = fs.readFileSync('src/lib/server/analytics.ts', 'utf8');

const target = 'const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())\n      .map(([videoId, { revenueMinor, model }]) => ({';
const replacement = 'const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())\n      .filter(([id]) => !videoId || id === videoId)\n      .map(([id, { revenueMinor, model }]) => ({';

code = code.replace(target, replacement);
code = code.replace(target.replace('\\n', '\\r\\n'), replacement);

// Next we replace the map block
const target2 = `        videoId,
        title: viewsByVideoId.get(videoId)?.title ?? "Untitled",
        revenueMinor,
        views: viewsByVideoId.get(videoId)?.views ?? 0,
        model,
      }))`;
const replacement2 = `        videoId: id,
        title: viewsByVideoId.get(id)?.title ?? "Untitled",
        revenueMinor,
        views: viewsByVideoId.get(id)?.views ?? 0,
        model,
      }))`;
code = code.replace(target2, replacement2);
code = code.replace(target2.replace(/\n/g, '\r\n'), replacement2);

fs.writeFileSync('src/lib/server/analytics.ts', code);
