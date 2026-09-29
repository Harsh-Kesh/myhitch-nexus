const fs = require('fs');
let code = fs.readFileSync('src/app/api/account/settings/route.ts', 'utf8');

const updatedGet = `export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await query(
    \`SELECT notification_preferences, privacy_settings, parental_controls 
     FROM accounts 
     WHERE id = $1\`,
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
}`;

code = code.replace(/export async function GET[\s\S]*?(?=export async function PATCH)/, updatedGet + "\n\n");

fs.writeFileSync('src/app/api/account/settings/route.ts', code);
