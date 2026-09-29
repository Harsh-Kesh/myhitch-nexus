const fs = require('fs');
let code = fs.readFileSync('src/lib/server/analytics.ts', 'utf8').replace(/\r\n/g, '\n');

// 1. Revert getPlatformAnalytics
code = code.replace(
  /const topVideos = \[\.\.\.currentRows\]\n    \.filter\(\(row\) => !videoId \|\| row\.video_id === videoId\)/,
  `const topVideos = [...currentRows]`
);

// 2. Patch getRealCreatorAnalytics properly
code = code.replace(
  /const topVideos: RealVideoRow\[\] = currentRows\n      \.map\(\(row\) => \(\{/m,
  `const topVideos: RealVideoRow[] = currentRows
      .filter((row) => !videoId || row.video_id === videoId)
      .map((row) => ({`
);

// The revenue By Content is inside getRealCreatorAnalytics and looks like this:
//     const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())
//       .map(([videoId, { revenueMinor, model }]) => ({

// Wait, I had patched `revenueByContent` previously as well! Let's check what I did to it.
// I patched: `const revenueByContent = [...revenue]`
// Does `getRealCreatorAnalytics` have `const revenueByContent = [...revenue]`?
// No, it has `const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())`
// So my patch hit something else? Or didn't hit anything.

fs.writeFileSync('src/lib/server/analytics.ts', code);
