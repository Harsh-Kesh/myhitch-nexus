import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { getRequestAccount } from "@/lib/server/rbac";
import { emitNotification } from "@/lib/server/notifications";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await query(
    `SELECT notification_preferences, privacy_settings, parental_controls 
     FROM accounts 
     WHERE id = $1`,
    [account.id]
  );
  
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  
  const row = rows[0];
  
  const defaultNotificationPrefs = {
    "new-upload": { email: true, inApp: true },
    "live-starting": { email: true, inApp: true },
    reply: { email: false, inApp: true },
    mention: { email: false, inApp: true },
    "purchase-receipt": { email: true, inApp: false },
    "rental-expiring": { email: true, inApp: true },
    payout: { email: true, inApp: false },
    policy: { email: true, inApp: false },
  };

  const defaultPrivacy = {
    watchHistoryVisible: false,
    watchlistPublic: false,
    personalisedRecommendations: true,
    personalisedAds: false,
  };

  const defaultParentalControls = {
    enabled: true,
    maxAgeRating: "12",
    pin: "••••",
  };

  return NextResponse.json({
    notificationPreferences: { ...defaultNotificationPrefs, ...row.notification_preferences },
    privacy: { ...defaultPrivacy, ...row.privacy_settings },
    parentalControls: { ...defaultParentalControls, ...row.parental_controls }
  });
}

export async function PATCH(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (body.notificationPreferences !== undefined) {
    updates.push(`notification_preferences = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(body.notificationPreferences));
  }
  
  if (body.privacy !== undefined) {
    updates.push(`privacy_settings = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(body.privacy));
  }
  
  if (body.parentalControls !== undefined) {
    updates.push(`parental_controls = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(body.parentalControls));
  }

  if (updates.length > 0) {
    values.push(account.id);
    await query(
      `UPDATE accounts SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    await emitNotification(
      account.id,
      "settings-updated",
      "Account settings updated",
      "Your privacy or notification preferences have been successfully updated.",
      "/settings"
    );
  }

  return NextResponse.json({ success: true });
}
