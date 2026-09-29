const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8');

code = code.replace(
  /store\.user\.profiles\s*=\s*pData\.profiles\.map\(\(p, idx\) => \(\{[\s\S]*?\}\)\);/m,
  `const selfProfile = store.user.profiles.find((p) => p.id === \`real-self-\${store.user.id}\`);
            const fetchedProfiles = pData.profiles.map((p, idx) => ({
              id: p.id,
              name: p.name,
              kind: p.isKids ? "child" : p.maturityRating === "TEEN" ? "teen" : "adult",
              avatarGradient: profileGradients[idx % profileGradients.length] ?? ["#5B8DEF", "#243F80"],
              avatarUrl: p.avatarUrl ?? undefined,
              maxAgeRating: p.maturityRating === "ALL" ? "U" : p.maturityRating === "PG" ? "PG" : p.maturityRating === "TEEN" ? "12" : "18",
              language: store.user.language,
              hasPinSet: p.hasPinSet,
              isKids: p.isKids,
            }));
            store.user.profiles = selfProfile ? [selfProfile, ...fetchedProfiles] : fetchedProfiles;`
);

fs.writeFileSync('src/lib/mock-api/index.ts', code);
