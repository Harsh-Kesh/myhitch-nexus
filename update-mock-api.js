const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /export async function getCreatorAnalytics\(\n  channelId: string,\n  range: AnalyticsRange = "28d",\n\): Promise<CreatorAnalytics> \{/g,
  `export async function getCreatorAnalytics(
  channelId: string,
  range: AnalyticsRange = "28d",
  videoId: string | null = null
): Promise<CreatorAnalytics> {`
);

code = code.replace(
  /const res = await fetch\(\n        `\/api\/studio\/analytics\/\?channelId=\$\{encodeURIComponent\(channelId\)\}&range=\$\{encodeURIComponent\(range\)\}`,\n      \);/g,
  `const res = await fetch(
        \`/api/studio/analytics/?channelId=\${encodeURIComponent(channelId)}&range=\${encodeURIComponent(range)}\${videoId ? \`&videoId=\${encodeURIComponent(videoId)}\` : ""}\`,
      );`
);

// We need to also filter the mock return if it's not a real channel!
code = code.replace(
  /return \{\n        channelId,\n        range,\n        ...stats,\n        timeSeries: mockTimeSeries,\n        retention: mockRetention,\n        topVideos: mockTopVideos,\n        revenueByContent: mockRevenue,\n        countries: mockCountries,\n        devices: mockDevices,\n        languages: mockLanguages,\n      \};/,
  `return {
        channelId,
        range,
        ...stats,
        timeSeries: mockTimeSeries,
        retention: mockRetention,
        topVideos: videoId ? mockTopVideos.filter(v => v.videoId === videoId) : mockTopVideos,
        revenueByContent: videoId ? mockRevenue.filter(v => v.videoId === videoId) : mockRevenue,
        countries: mockCountries,
        devices: mockDevices,
        languages: mockLanguages,
      };`
);

fs.writeFileSync('src/lib/mock-api/index.ts', code);
