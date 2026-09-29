const fs = require('fs');
let code = fs.readFileSync('src/lib/server/analytics.ts', 'utf8');

const t1 = `  const topVideos: RealVideoRow[] = currentRows\n    .map((row) => ({\n      videoId: row.video_id,`;
const r1 = `  const topVideos: RealVideoRow[] = currentRows\n    .filter((row) => !videoId || row.video_id === videoId)\n    .map((row) => ({\n      videoId: row.video_id,`;

const t1_crlf = `  const topVideos: RealVideoRow[] = currentRows\r\n    .map((row) => ({\r\n      videoId: row.video_id,`;
const r1_crlf = `  const topVideos: RealVideoRow[] = currentRows\r\n    .filter((row) => !videoId || row.video_id === videoId)\r\n    .map((row) => ({\r\n      videoId: row.video_id,`;

code = code.replace(t1, r1).replace(t1_crlf, r1_crlf);

const t2 = `  const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())\n    .map(([videoId, { revenueMinor, model }]) => ({\n      videoId,`;
const r2 = `  const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())\n    .filter(([id]) => !videoId || id === videoId)\n    .map(([id, { revenueMinor, model }]) => ({\n      videoId: id,`;

const t2_crlf = `  const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())\r\n    .map(([videoId, { revenueMinor, model }]) => ({\r\n      videoId,`;
const r2_crlf = `  const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())\r\n    .filter(([id]) => !videoId || id === videoId)\r\n    .map(([id, { revenueMinor, model }]) => ({\r\n      videoId: id,`;

code = code.replace(t2, r2).replace(t2_crlf, r2_crlf);

fs.writeFileSync('src/lib/server/analytics.ts', code);
