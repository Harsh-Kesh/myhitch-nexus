const fs = require('fs');
let code = fs.readFileSync('src/lib/server/analytics.ts', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /export async function getRealCreatorAnalytics\(\n  channelId: string,\n  range: AnalyticsRange,\n\): Promise<RealCreatorAnalytics> \{/m,
  `export async function getRealCreatorAnalytics(
  channelId: string,
  range: AnalyticsRange,
  videoId?: string | null
): Promise<RealCreatorAnalytics> {`
);

code = code.replace(
  /const topVideos = \[\.\.\.currentRows\]\n    \.map\(\(row\) => \(\{\n      videoId: row\.video_id,/m,
  `const topVideos = [...currentRows]
    .filter((row) => !videoId || row.video_id === videoId)
    .map((row) => ({
      videoId: row.video_id,`
);

code = code.replace(
  /const revenueByContent = \[\.\.\.revenue\]\n    \.map\(\(row\) => \(\{\n      videoId: row\.video_id,/m,
  `const revenueByContent = [...revenue]
    .filter((row) => !videoId || row.video_id === videoId)
    .map((row) => ({
      videoId: row.video_id,`
);

fs.writeFileSync('src/lib/server/analytics.ts', code);
