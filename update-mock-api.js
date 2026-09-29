const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8');

code = code.replace(
  `export async function getFeaturedContent(): Promise<FeaturedContent> {
  const res = await fetch("/api/home/");`,
  `export async function getFeaturedContent(): Promise<FeaturedContent> {
  const profileParam = looksLikeRealId(store.user.activeProfileId ?? "")
    ? \`?profileId=\${encodeURIComponent(store.user.activeProfileId!)}\`
    : "";
  const res = await fetch(\`/api/home/\${profileParam}\`);`
);

fs.writeFileSync('src/lib/mock-api/index.ts', code);
