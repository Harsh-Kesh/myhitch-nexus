// Server-only. Real commission configuration + the one place net (creator-share)
// revenue is computed from gross entitlements — both commerce.ts's revenue summary and
// payouts.ts's available balance go through computeChannelNetRevenue() so the two can
// never disagree about how much a channel has actually earned.
import "server-only";
import { query, queryOne } from "./db";

export type CommissionScope = "purchase_rental" | "ppv" | "membership";

export interface CommissionRate {
  id: string;
  scope: CommissionScope;
  platformSharePct: number;
  effectiveFrom: string;
}

export async function listCommissionRates(): Promise<CommissionRate[]> {
  const rows = await query<{ id: string; scope: CommissionScope; platform_share_pct: number; effective_from: string }>(
    `select id, scope, platform_share_pct, effective_from from commission_rates order by scope, effective_from desc`,
  );
  return rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    platformSharePct: row.platform_share_pct,
    effectiveFrom: row.effective_from,
  }));
}

/** Inserts a new rate row rather than updating in place — see the migration's own
 * header comment on why: existing transactions must keep whatever rate was in effect
 * when they happened. */
export async function setCommissionRate(scope: CommissionScope, platformSharePct: number): Promise<CommissionRate> {
  const row = await queryOne<{ id: string; effective_from: string }>(
    `insert into commission_rates (scope, platform_share_pct) values ($1, $2) returning id, effective_from`,
    [scope, platformSharePct],
  );
  return { id: row!.id, scope, platformSharePct, effectiveFrom: row!.effective_from };
}

/** The most recent rate for `scope` that was already in effect at `at` — 0 (no platform
 * cut) if nothing was configured yet at that point, an honest default rather than a
 * guess at what a since-added rate "should" have been retroactively. */
function pickEffectiveRate(rates: CommissionRate[], scope: CommissionScope, at: Date): number {
  let best: CommissionRate | null = null;
  for (const rate of rates) {
    if (rate.scope !== scope) continue;
    const effectiveFrom = new Date(rate.effectiveFrom);
    if (effectiveFrom > at) continue;
    if (!best || effectiveFrom > new Date(best.effectiveFrom)) best = rate;
  }
  return best?.platformSharePct ?? 0;
}

export type EntitlementKind = "buy" | "rent" | "ppv";

function scopeForEntitlementKind(kind: EntitlementKind): CommissionScope {
  return kind === "ppv" ? "ppv" : "purchase_rental";
}

export interface ChannelRevenueEntry {
  id: string;
  kind: EntitlementKind;
  title: string;
  createdAt: string;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
}

export interface ChannelRevenue {
  entries: ChannelRevenueEntry[];
  grossMinor: number;
  netMinor: number;
  currency: string;
}

/** One-time-purchase (buy/rent/ppv) revenue only — channel memberships aren't real yet
 * (see the subscriptions migration's own header comment), so there's nothing of that
 * scope to include here today; the "membership" commission rate exists for when that
 * lands. */
export async function computeChannelNetRevenue(organizationId: string): Promise<ChannelRevenue> {
  const rows = await query<{
    id: string;
    kind: EntitlementKind;
    amount_minor: number;
    currency: string;
    created_at: string;
    title: string;
  }>(
    `select e.id, e.kind, e.amount_minor, e.currency, e.created_at, v.title
     from entitlements e
     join videos v on v.id = e.video_id
     where v.channel_id = $1
     order by e.created_at desc`,
    [organizationId],
  );
  const rates = await listCommissionRates();

  let grossMinor = 0;
  let netMinor = 0;
  const entries = rows.map((row) => {
    const pct = pickEffectiveRate(rates, scopeForEntitlementKind(row.kind), new Date(row.created_at));
    const feeMinor = Math.round((row.amount_minor * pct) / 100);
    const rowNetMinor = row.amount_minor - feeMinor;
    grossMinor += row.amount_minor;
    netMinor += rowNetMinor;
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      createdAt: row.created_at,
      grossMinor: row.amount_minor,
      feeMinor,
      netMinor: rowNetMinor,
      currency: row.currency,
    };
  });

  return { entries, grossMinor, netMinor, currency: rows[0]?.currency ?? "GBP" };
}
