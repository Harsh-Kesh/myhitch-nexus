const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/hooks.ts', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /export const useCreatorAnalytics = \(channelId: string, range: AnalyticsRange = "28d"\) =>\n  useQuery\(\{\n    queryKey: qk\.analytics\(channelId, range\),\n    queryFn: \(\) => api\.getCreatorAnalytics\(channelId, range\),/g,
  `export const useCreatorAnalytics = (channelId: string, range: AnalyticsRange = "28d", videoId: string | null = null) =>
  useQuery({
    queryKey: [...qk.analytics(channelId, range), videoId],
    queryFn: () => api.getCreatorAnalytics(channelId, range, videoId),`
);

fs.writeFileSync('src/lib/mock-api/hooks.ts', code);
