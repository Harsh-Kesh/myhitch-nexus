const fs = require('fs');
let code = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8');

code = code.replace(
  /export async function getNotifications\(\): Promise<AppNotification\[\]> \{[\s\S]*?return clone\(store\.notifications\);\s*\}/,
  `export async function getNotifications(): Promise<AppNotification[]> {
    const res = await fetch("/api/notifications");
    if (!res.ok) throw new Error("Failed to load notifications");
    return res.json();
  }`
);

code = code.replace(
  /export async function markNotificationRead\(id: string\): Promise<void> \{[\s\S]*?if \(notification\) notification\.read = true;\s*\}/,
  `export async function markNotificationRead(id: string): Promise<void> {
    await fetch(\`/api/notifications/\${id}/read\`, { method: "PATCH" });
  }`
);

code = code.replace(
  /export async function markAllNotificationsRead\(\): Promise<void> \{[\s\S]*?\}\s*\}/,
  `export async function markAllNotificationsRead(): Promise<void> {
    await fetch("/api/notifications", { method: "POST" });
  }`
);

fs.writeFileSync('src/lib/mock-api/index.ts', code);
