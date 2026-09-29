const fs = require('fs');
let code = fs.readFileSync('src/app/api/studio/analytics/route.ts', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /const range = VALID_RANGES\.includes\(rangeParam as AnalyticsRange\) \? \(rangeParam as AnalyticsRange\) : "28d";\n\n  try \{/g,
  `const range = VALID_RANGES.includes(rangeParam as AnalyticsRange) ? (rangeParam as AnalyticsRange) : "28d";
  const videoId = request.nextUrl.searchParams.get("videoId");

  try {`
);

code = code.replace(
  /const analytics = await getRealCreatorAnalytics\(channelId, range\);/g,
  `const analytics = await getRealCreatorAnalytics(channelId, range, videoId);`
);

fs.writeFileSync('src/app/api/studio/analytics/route.ts', code);
