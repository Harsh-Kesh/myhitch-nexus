import { NextResponse, type NextRequest } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { getRequestAccount } from "@/lib/server/rbac";

async function ensureTableExists() {
  await query(`
    CREATE TABLE IF NOT EXISTS channel_comment_settings (
      channel_id text primary key references organizations(id) on delete cascade,
      hold_links boolean not null default true,
      hold_new_accounts boolean not null default false,
      blocked_words jsonb not null default '[]'::jsonb
    )
  `);
}

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!account.channelId) return NextResponse.json({ error: "Channel required." }, { status: 403 });

  await ensureTableExists();

  let settings = await queryOne<{ hold_links: boolean; hold_new_accounts: boolean; blocked_words: string[] }>(
    `SELECT hold_links, hold_new_accounts, blocked_words FROM channel_comment_settings WHERE channel_id = $1`,
    [account.channelId]
  );

  if (!settings) {
    settings = {
      hold_links: true,
      hold_new_accounts: false,
      blocked_words: ["scam", "free money", "click here", "crypto giveaway"],
    };
  }

  return NextResponse.json({
    holdLinks: settings.hold_links,
    holdNewAccounts: settings.hold_new_accounts,
    blockedWords: settings.blocked_words,
  });
}

export async function PUT(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!account.channelId) return NextResponse.json({ error: "Channel required." }, { status: 403 });

  let body: { holdLinks?: boolean; holdNewAccounts?: boolean; blockedWords?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await ensureTableExists();

  const settings = await queryOne<{ hold_links: boolean; hold_new_accounts: boolean; blocked_words: string[] }>(
    `SELECT hold_links, hold_new_accounts, blocked_words FROM channel_comment_settings WHERE channel_id = $1`,
    [account.channelId]
  );

  const newHoldLinks = body.holdLinks ?? settings?.hold_links ?? true;
  const newHoldNewAccounts = body.holdNewAccounts ?? settings?.hold_new_accounts ?? false;
  const newBlockedWords = body.blockedWords ?? settings?.blocked_words ?? ["scam", "free money", "click here", "crypto giveaway"];

  await query(`
    INSERT INTO channel_comment_settings (channel_id, hold_links, hold_new_accounts, blocked_words)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (channel_id) DO UPDATE SET
      hold_links = EXCLUDED.hold_links,
      hold_new_accounts = EXCLUDED.hold_new_accounts,
      blocked_words = EXCLUDED.blocked_words
  `, [account.channelId, newHoldLinks, newHoldNewAccounts, JSON.stringify(newBlockedWords)]);

  return NextResponse.json({ success: true });
}
