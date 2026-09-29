import { query } from "./db";

export async function emitNotification(
  accountId: string,
  event: string,
  title: string,
  body: string,
  href: string
): Promise<void> {
  try {
    const res = await query(
      `SELECT notification_preferences FROM accounts WHERE id = $1`,
      [accountId]
    );

    if (res.length === 0) return;

    const prefs = res[0].notification_preferences || {};
    const eventPrefs = prefs[event] || { inApp: true, email: true, push: false };

    // Only insert if inApp is enabled for this event
    if (eventPrefs.inApp) {
      await query(
        `INSERT INTO notifications (account_id, event, title, body, href)
         VALUES ($1, $2, $3, $4, $5)`,
        [accountId, event, title, body, href]
      );
    }
  } catch (err) {
    console.error("Failed to emit notification:", err);
  }
}
