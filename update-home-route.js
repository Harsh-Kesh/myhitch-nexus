const fs = require('fs');
let code = fs.readFileSync('src/app/api/home/route.ts', 'utf8');

code = code.replace(
  "const featured = await getFeaturedRails(account?.id ?? null);",
  `const profileId = account ? await verifyOwnProfileId(account.id, request.nextUrl.searchParams.get("profileId")) : null;
    const featured = await getFeaturedRails(account?.id ?? null, profileId);`
);

code = code.replace(
  "import { getRequestAccount } from \"@/lib/server/rbac\";",
  `import { verifyOwnProfileId } from "@/lib/server/familyProfiles";
import { getRequestAccount } from "@/lib/server/rbac";`
);

fs.writeFileSync('src/app/api/home/route.ts', code);
