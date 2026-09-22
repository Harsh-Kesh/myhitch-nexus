// Server-only. Real commission configuration + the one place net (creator-share)
// revenue is computed from gross entitlements — both commerce.ts's revenue summary and
// payouts.ts's available balance go through computeChannelNetRevenue() so the two can
// never disagree about how much a channel has actually earned.
import "server-only";
import { query, queryOne } from "./db";

export type CommissionScope = "purchase_rental" | "ppv" | "membership" | "ad_revenue";

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

/** The one place ad-impression cost gets split into platform-fee/creator-net — called
 * once, at impression-recording time (POST /api/ads/impression), then stored on the row;
 * see computeChannelNetRevenue()'s comment on why that split is never recomputed later. */
export async function getAdRevenueSharePct(at: Date = new Date()): Promise<number> {
  const rates = await listCommissionRates();
  return pickEffectiveRate(rates, "ad_revenue", at);
}

export type EntitlementKind = "buy" | "rent" | "ppv";
export type RevenueEntryKind = EntitlementKind | "membership" | "ad";

function scopeForEntitlementKind(kind: EntitlementKind): CommissionScope {
  return kind === "ppv" ? "ppv" : "purchase_rental";
}

export interface ChannelRevenueEntry {
  id: string;
  kind: RevenueEntryKind;
  title: string;
  /** null for membership entries — a membership isn't attached to one video, unlike a
   * purchase/rental/PPV entitlement. Added for the real analytics slice's
   * "revenue by content" breakdown; existing consumers of this entry shape ignore it. */
  videoId: string | null;
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

/** One-time purchases (buy/rent/ppv), recurring channel-membership payments, and ad
 * impressions served against this channel's content — the real revenue sources a channel
 * has. Combined and re-sorted by date so the ledger reads as one timeline rather than
 * several lists stitched together. Ad rows don't go through pickEffectiveRate() below —
 * unlike a purchase/membership row, an ad_impressions row already has its platform-fee/
 * creator-net split computed and stored at write time (see /api/ads/impression), using
 * whatever 'ad_revenue' rate was in effect at that moment — recomputing it here from the
 * *current* rate would silently redate historic impressions to today's rate. */
export async function computeChannelNetRevenue(organizationId: string): Promise<ChannelRevenue> {
  const entitlementRows = await query<{
    id: string;
    kind: EntitlementKind;
    amount_minor: number;
    currency: string;
    created_at: string;
    title: string;
    video_id: string;
  }>(
    `select e.id, e.kind, e.amount_minor, e.currency, e.created_at, v.title, v.id as video_id
     from entitlements e
     join videos v on v.id = e.video_id
     where v.channel_id = $1
     order by e.created_at desc`,
    [organizationId],
  );
  const membershipRows = await query<{
    id: string;
    amount_minor: number;
    currency: string;
    created_at: string;
  }>(
    `select id, amount_minor, currency, created_at from membership_payments
     where channel_id = $1
     order by created_at desc`,
    [organizationId],
  );
  const adRows = await query<{
    id: string;
    cost_minor: number;
    platform_fee_minor: number;
    creator_net_minor: number;
    currency: string;
    created_at: string;
  }>(
    `select id, cost_minor, platform_fee_minor, creator_net_minor, currency, created_at
     from ad_impressions where channel_id = $1
     order by created_at desc`,
    [organizationId],
  );
  const rates = await listCommissionRates();

  let grossMinor = 0;
  let netMinor = 0;
  const entries: ChannelRevenueEntry[] = [];

  for (const row of entitlementRows) {
    const pct = pickEffectiveRate(rates, scopeForEntitlementKind(row.kind), new Date(row.created_at));
    const feeMinor = Math.round((row.amount_minor * pct) / 100);
    const rowNetMinor = row.amount_minor - feeMinor;
    grossMinor += row.amount_minor;
    netMinor += rowNetMinor;
    entries.push({
      id: row.id,
      kind: row.kind,
      title: row.title,
      videoId: row.video_id,
      createdAt: new Date(row.created_at).toISOString(),
      grossMinor: row.amount_minor,
      feeMinor,
      netMinor: rowNetMinor,
      currency: row.currency,
    });
  }

  for (const row of membershipRows) {
    const pct = pickEffectiveRate(rates, "membership", new Date(row.created_at));
    const feeMinor = Math.round((row.amount_minor * pct) / 100);
    const rowNetMinor = row.amount_minor - feeMinor;
    grossMinor += row.amount_minor;
    netMinor += rowNetMinor;
    entries.push({
      id: row.id,
      kind: "membership",
      title: "Channel membership",
      videoId: null,
      createdAt: new Date(row.created_at).toISOString(),
      grossMinor: row.amount_minor,
      feeMinor,
      netMinor: rowNetMinor,
      currency: row.currency,
    });
  }

  for (const row of adRows) {
    grossMinor += row.cost_minor;
    netMinor += row.creator_net_minor;
    entries.push({
      id: row.id,
      kind: "ad",
      title: "Ad impression",
      videoId: null,
      createdAt: new Date(row.created_at).toISOString(),
      grossMinor: row.cost_minor,
      feeMinor: row.platform_fee_minor,
      netMinor: row.creator_net_minor,
      currency: row.currency,
    });
  }

  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { entries, grossMinor, netMinor, currency: entries[0]?.currency ?? "GBP" };
}

export interface PlatformRevenueSummary {
  /** The platform's own earned revenue, last 30 days — commission on entitlements/
   * membership_payments (creator-attributed transactions) plus the full amount of every
   * subscription_payments row (platform-wide Premium/Family/Business plans have no
   * creator attribution at the point of sale, so 100% of it is platform revenue, not a
   * commission split). Not gross transaction volume — the correct "Revenue" figure for
   * an operator dashboard. */
  commission30dMinor: number;
  /** All-time net-to-creator revenue across every organization, minus everything already
   * paid out — same "how much do creators collectively have coming" semantics as
   * getAvailableBalance() (payouts.ts), not gated on Connect onboarding status. */
  payoutsDueMinor: number;
  currency: string;
}

/** Platform-wide counterpart of computeChannelNetRevenue()/getAvailableBalance() — both of
 * those are per-organization by construction (every query in this file and payouts.ts
 * filters `where channel_id = $1` / `where organization_id = $1`), so this doesn't call
 * either; it re-expresses the same commission-rate-window logic pickEffectiveRate() encodes
 * (latest commission_rates row per scope with effective_from <= the transaction's own
 * created_at) as a LEFT JOIN LATERAL, since that JS function only works against an
 * already-fetched, already-org-filtered row array, not a set-based cross-org query. Backs
 * the admin dashboard's "Revenue (30d)"/"Payouts due" tiles (getAdminSummary()'s real
 * branch), previously hardcoded to 0 pending this. */
export async function getPlatformRevenueSummary(): Promise<PlatformRevenueSummary> {
  const row = await queryOne<{
    commission_30d_minor: string;
    net_all_time_minor: string;
    paid_minor: string;
  }>(
    `with rated as (
       select e.amount_minor, e.created_at, coalesce(cr.platform_share_pct, 0) as pct
       from entitlements e
       left join lateral (
         select platform_share_pct from commission_rates
         where scope = (case when e.kind = 'ppv' then 'ppv' else 'purchase_rental' end)
           and effective_from <= e.created_at
         order by effective_from desc limit 1
       ) cr on true
       union all
       select mp.amount_minor, mp.created_at, coalesce(cr.platform_share_pct, 0) as pct
       from membership_payments mp
       left join lateral (
         select platform_share_pct from commission_rates
         where scope = 'membership' and effective_from <= mp.created_at
         order by effective_from desc limit 1
       ) cr on true
     ),
     subs as (
       -- Platform-wide plan revenue: no creator attribution, no commission-rate lookup,
       -- the full amount is platform revenue, unlike the rated CTE above.
       select coalesce(sum(amount_minor), 0) as subs_30d_minor
       from subscription_payments
       where created_at >= now() - interval '30 days'
     ),
     ads as (
       -- Already split at write time (see /api/ads/impression) — summed directly, not
       -- re-rated through pickEffectiveRate()'s current-rate lookup, for the same
       -- "don't redate history" reason computeChannelNetRevenue() documents.
       select
         coalesce(sum(cost_minor) filter (where created_at >= now() - interval '30 days'), 0) as ads_gross_30d_minor,
         coalesce(sum(platform_fee_minor) filter (where created_at >= now() - interval '30 days'), 0) as ads_fee_30d_minor,
         coalesce(sum(creator_net_minor), 0) as ads_net_all_time_minor
       from ad_impressions
     ),
     paid as (
       select coalesce(sum(amount_minor), 0) as paid_minor from payouts where status = 'paid'
     )
     select
       coalesce(sum(case when rated.created_at >= now() - interval '30 days'
         then round(rated.amount_minor * rated.pct / 100.0) else 0 end), 0)
         + (select subs_30d_minor from subs)
         + (select ads_fee_30d_minor from ads) as commission_30d_minor,
       coalesce(sum(rated.amount_minor - round(rated.amount_minor * rated.pct / 100.0)), 0)
         + (select ads_net_all_time_minor from ads) as net_all_time_minor,
       (select paid_minor from paid) as paid_minor
     from rated`,
  );

  const netAllTime = Number(row?.net_all_time_minor ?? 0);
  const paid = Number(row?.paid_minor ?? 0);

  return {
    commission30dMinor: Number(row?.commission_30d_minor ?? 0),
    payoutsDueMinor: Math.max(netAllTime - paid, 0),
    // Same single-currency simplification as every other Money value in this codebase —
    // no multi-currency handling exists anywhere yet.
    currency: "GBP",
  };
}

export interface RevenueStreamSlice {
  label: string;
  grossMinor: number;
}

/** Real gross revenue by stream, last `days` — replaces the finance page's old
 * hardcoded 42/52/6% Advertising/Subscriptions/Commerce split (neither Advertising nor
 * Commerce is real: no campaigns table, no ad-serving). Three independent scalar sums
 * rather than one combined query — each source is a distinct real table, not worth a
 * join for three numbers. */
export async function getPlatformRevenueByStream(days = 30): Promise<RevenueStreamSlice[]> {
  const rows = await query<{ label: string; gross_minor: string }>(
    `select 'Subscriptions' as label, coalesce(sum(amount_minor), 0) as gross_minor
       from subscription_payments where created_at >= now() - ($1::int) * interval '1 day'
     union all
     select 'Purchases & rentals' as label, coalesce(sum(amount_minor), 0) as gross_minor
       from entitlements where created_at >= now() - ($1::int) * interval '1 day'
     union all
     select 'Channel memberships' as label, coalesce(sum(amount_minor), 0) as gross_minor
       from membership_payments where created_at >= now() - ($1::int) * interval '1 day'
     union all
     select 'Advertising' as label, coalesce(sum(cost_minor), 0) as gross_minor
       from ad_impressions where created_at >= now() - ($1::int) * interval '1 day'`,
    [days],
  );
  return rows.map((row) => ({ label: row.label, grossMinor: Number(row.gross_minor) })).filter((s) => s.grossMinor > 0);
}

export interface RevenueTrendPoint {
  date: string;
  grossMinor: number;
  commissionMinor: number;
}

/** Real daily platform-revenue time series (gross + platform's own commission/subscription
 * take), zero-filled via generate_series exactly like moderation.ts's getModerationTrend()
 * — backs the admin finance page's chart, replacing the mock's mislabeled "Transactions"
 * bar chart (which actually plotted review/report counts, not revenue). */
export async function getPlatformRevenueTrend(days = 30): Promise<RevenueTrendPoint[]> {
  const rows = await query<{ date: string; gross_minor: string; commission_minor: string }>(
    `with rated as (
       select e.amount_minor, e.created_at, coalesce(cr.platform_share_pct, 0) as pct
       from entitlements e
       left join lateral (
         select platform_share_pct from commission_rates
         where scope = (case when e.kind = 'ppv' then 'ppv' else 'purchase_rental' end)
           and effective_from <= e.created_at
         order by effective_from desc limit 1
       ) cr on true
       union all
       select mp.amount_minor, mp.created_at, coalesce(cr.platform_share_pct, 0) as pct
       from membership_payments mp
       left join lateral (
         select platform_share_pct from commission_rates
         where scope = 'membership' and effective_from <= mp.created_at
         order by effective_from desc limit 1
       ) cr on true
       union all
       select sp.amount_minor, sp.created_at, 100 as pct
       from subscription_payments sp
       union all
       -- pct derived from the already-computed platform_fee_minor (not looked up), so
       -- round(amount_minor * pct / 100) reproduces platform_fee_minor exactly — see
       -- computeChannelNetRevenue()'s comment on why ad rows don't get re-rated.
       select ai.cost_minor as amount_minor, ai.created_at,
         case when ai.cost_minor > 0 then ai.platform_fee_minor * 100.0 / ai.cost_minor else 0 end as pct
       from ad_impressions ai
     )
     select
       d::date::text as date,
       coalesce(r.gross_minor, 0) as gross_minor,
       coalesce(r.commission_minor, 0) as commission_minor
     from generate_series(current_date - ($1::int - 1) * interval '1 day', current_date, interval '1 day') d
     left join (
       select date_trunc('day', created_at)::date as day,
              sum(amount_minor) as gross_minor,
              sum(round(amount_minor * pct / 100.0)) as commission_minor
       from rated
       where created_at >= current_date - ($1::int - 1) * interval '1 day'
       group by 1
     ) r on r.day = d::date
     order by d`,
    [days],
  );
  return rows.map((row) => ({
    date: row.date,
    grossMinor: Number(row.gross_minor),
    commissionMinor: Number(row.commission_minor),
  }));
}
