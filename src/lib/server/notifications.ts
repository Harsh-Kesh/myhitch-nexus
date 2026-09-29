import { query } from "./db";

export async function emitNotification(
  accountId: string,
  event: string,
  title: string,
  body: string,
  href: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (account_id, event, title, body, href)
       VALUES ($1, $2, $3, $4, $5)`,
      [accountId, event, title, body, href]
    );
  } catch (err) {
    console.error("Failed to emit notification:", err);
  }
}
