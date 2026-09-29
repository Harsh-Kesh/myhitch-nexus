const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8');

// 1. getFeaturedContent
code = code.replace(
  `export async function getFeaturedContent(): Promise<FeaturedContent> {
  const res = await fetch("/api/home/");`,
  `export async function getFeaturedContent(): Promise<FeaturedContent> {
  const profileParam = looksLikeRealId(store.user.activeProfileId ?? "")
    ? \`?profileId=\${encodeURIComponent(store.user.activeProfileId!)}\`
    : "";
  const res = await fetch(\`/api/home/\${profileParam}\`);`
);

// 2. getNotifications
code = code.replace(
  `export async function getNotifications(): Promise<AppNotification[]> {
  await latency("fast");
  return clone(store.notifications);
}`,
  `export async function getNotifications(): Promise<AppNotification[]> {
  const res = await fetch("/api/notifications");
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json();
}`
);

// 3. markNotificationRead
code = code.replace(
  `export async function markNotificationRead(id: string): Promise<void> {
  const notification = store.notifications.find((item) => item.id === id);
  if (notification) notification.read = true;
}`,
  `export async function markNotificationRead(id: string): Promise<void> {
  await fetch(\`/api/notifications/\${id}/read\`, { method: "PATCH" });
}`
);

// 4. markAllNotificationsRead
code = code.replace(
  `export async function markAllNotificationsRead(): Promise<void> {
  store.notifications.forEach((notification) => {
    notification.read = true;
  });
}`,
  `export async function markAllNotificationsRead(): Promise<void> {
  await fetch("/api/notifications", { method: "POST" });
}`
);

// 5. getCurrentUser
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

// 6. updateUser
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
