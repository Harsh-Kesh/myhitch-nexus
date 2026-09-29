const fs = require('fs');
let code = fs.readFileSync('src/app/(public)/account/playlists/page.tsx', 'utf8');

code = code.replace(
  /useCurrentUser,\n  useDeletePlaylist,/,
  `useCurrentUser,\n  useDeletePlaylist,\n  useSubscriptions,`
);

code = code.replace(
  /const \{ data: user \} = useCurrentUser\(\);/,
  `const { data: user } = useCurrentUser();\n  const { data: subscriptions = [] } = useSubscriptions();`
);

code = code.replace(
  /const canScopeToProfile = \(user\?\.profiles\.length \?\? 0\) > 1;/,
  `const hasFamilyPlan = subscriptions.some((s) => s.status === "active" && s.plan === "family");\n  const canScopeToProfile = hasFamilyPlan && (user?.profiles.length ?? 0) > 1;`
);

fs.writeFileSync('src/app/(public)/account/playlists/page.tsx', code);
