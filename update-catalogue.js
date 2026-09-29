const fs = require('fs');
let code = fs.readFileSync('src/lib/server/catalogue.ts', 'utf8');

code = code.replace(
  "export async function getFeaturedRails(accountId: string | null): Promise<FeaturedCatalogue> {",
  "export async function getFeaturedRails(accountId: string | null, profileId: string | null = null): Promise<FeaturedCatalogue> {"
);

code = code.replace(
  "const continueEntries = accountId ? await getContinueWatchingVideos(accountId) : [];",
  "const continueEntries = accountId ? await getContinueWatchingVideos(accountId, profileId) : [];"
);

fs.writeFileSync('src/lib/server/catalogue.ts', code);
