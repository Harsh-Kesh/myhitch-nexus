const fs = require('fs');
let code = fs.readFileSync('src/lib/server/analytics.ts', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /const revenueByContent: RealRevenueByContent\[\] = Array\.from\(revenueByVideoId\.entries\(\)\)\n      \.map\(\(\[videoId, \{ revenueMinor, model \}\]\) => \(\{/m,
  `const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())
      .filter(([id]) => !videoId || id === videoId)
      .map(([id, { revenueMinor, model }]) => ({`
);

// We need to rename `videoId` in the map parameters to `id` to avoid shadowing the outer `videoId`.
// Wait, the original code had:
// .map(([videoId, { revenueMinor, model }]) => ({
//   videoId,
//   title: viewsByVideoId.get(videoId)?.title ?? "Untitled",
//   revenueMinor, ...
// We changed it to `id`. We need to also change it inside the map block!

code = code.replace(
  /\.map\(\(\[id, \{ revenueMinor, model \}\]\) => \(\{\n        videoId,\n        title: viewsByVideoId\.get\(videoId\)\?\.title \?\? "Untitled",\n        revenueMinor,\n        views: viewsByVideoId\.get\(videoId\)\?\.views \?\? 0,\n        model,\n      \}\)\)/,
  `.map(([id, { revenueMinor, model }]) => ({
        videoId: id,
        title: viewsByVideoId.get(id)?.title ?? "Untitled",
        revenueMinor,
        views: viewsByVideoId.get(id)?.views ?? 0,
        model,
      }))`
);

fs.writeFileSync('src/lib/server/analytics.ts', code);
