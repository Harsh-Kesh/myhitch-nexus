const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8');

// Inject the settings fetch inside getCurrentUser
const profileFetchBlock = `const pRes = await fetch("/api/account/profiles");`;
const settingsFetchBlock = `const sRes = await fetch("/api/account/settings");
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.notificationPreferences) store.user.notificationPreferences = sData.notificationPreferences;
          if (sData.privacy) store.user.privacy = sData.privacy;
          if (sData.parentalControls) store.user.parentalControls = sData.parentalControls;
        }
        
        const pRes = await fetch("/api/account/profiles");`;

code = code.replace(profileFetchBlock, settingsFetchBlock);


// Inject settings PATCH inside updateUser
const updateUserHeader = `export async function updateUser(patch: Partial<User>): Promise<User> {
  await latency("fast");
  Object.assign(store.user, patch);

  if (looksLikeRealId(store.user.id)) {`;

const updateUserSettingsPatch = `export async function updateUser(patch: Partial<User>): Promise<User> {
  await latency("fast");
  Object.assign(store.user, patch);

  if (looksLikeRealId(store.user.id)) {
    const settingsPatch: any = {};
    if ("notificationPreferences" in patch) settingsPatch.notificationPreferences = patch.notificationPreferences;
    if ("privacy" in patch) settingsPatch.privacy = patch.privacy;
    if ("parentalControls" in patch) settingsPatch.parentalControls = patch.parentalControls;

    if (Object.keys(settingsPatch).length > 0) {
      const sRes = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsPatch),
      });
      if (!sRes.ok) throw new Error("Failed to update settings");
    }
`;

code = code.replace(updateUserHeader, updateUserSettingsPatch);

fs.writeFileSync('src/lib/mock-api/index.ts', code);
