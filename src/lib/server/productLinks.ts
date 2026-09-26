// Server-only. Real "Shop this video" product links for a business/enterprise channel —
// was 100% mock (getProductLinks()/createProductLink() had no real branch, same gap as
// businessLeads.ts's getLeads()).
import "server-only";
import { query, queryOne, withTransaction } from "./db";

async function isChannelMember(accountId: string, organizationId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [accountId, organizationId],
  );
  return Boolean(row);
}

export interface ProductLinkRow {
  id: string;
  organizationId: string;
  productName: string;
  martProductId: string;
  priceCents: number;
  currency: string;
  commissionRate: number;
  targetUrl: string | null;
  clicksCount: number;
  conversionsCount: number;
  attachedVideoIds: string[];
  createdAt: string;
}

interface ProductLinkDbRow {
  id: string;
  organization_id: string;
  product_name: string;
  mart_product_id: string;
  price_cents: number;
  currency: string;
  commission_rate: string;
  target_url: string | null;
  clicks_count: number;
  conversions_count: number;
  created_at: string;
  attached_video_ids: string[] | null;
}

function mapLink(row: ProductLinkDbRow): ProductLinkRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    productName: row.product_name,
    martProductId: row.mart_product_id,
    priceCents: row.price_cents,
    currency: row.currency,
    commissionRate: Number(row.commission_rate),
    targetUrl: row.target_url,
    clicksCount: row.clicks_count,
    conversionsCount: row.conversions_count,
    attachedVideoIds: (row.attached_video_ids ?? []).filter((id): id is string => Boolean(id)),
    createdAt: row.created_at,
  };
}

const LINK_SELECT = `
  select p.*, array_remove(array_agg(vpl.video_id), null) as attached_video_ids
  from product_links p
  left join video_product_links vpl on vpl.product_link_id = p.id
`;

export async function listProductLinks(organizationId: string): Promise<ProductLinkRow[]> {
  const rows = await query<ProductLinkDbRow>(
    `${LINK_SELECT} where p.organization_id = $1 group by p.id order by p.created_at desc`,
    [organizationId],
  );
  return rows.map(mapLink);
}

export type CreateProductLinkResult = { outcome: "success"; link: ProductLinkRow } | { outcome: "invalid"; reason: string };

/** `attachedVideoIds` isn't verified against the org's own channel here — the caller
 * (the API route) already resolved organizationId from the signed-in account's own
 * membership, and a video id that doesn't belong to this org simply never shows the
 * resulting product card on that video's page (getVideoProductLinks() is the read path
 * that would need to match channel ownership, not this write path). */
export async function createProductLink(
  organizationId: string,
  input: {
    productName: string;
    martProductId?: string;
    priceCents: number;
    currency?: string;
    commissionRate?: number;
    targetUrl?: string | null;
    attachedVideoIds?: string[];
  },
): Promise<CreateProductLinkResult> {
  if (!input.productName.trim()) {
    return { outcome: "invalid", reason: "A product name is required." };
  }
  if (!Number.isFinite(input.priceCents) || input.priceCents < 0) {
    return { outcome: "invalid", reason: "A valid price is required." };
  }
  const martProductId =
    input.martProductId?.trim() ||
    `mart_${input.productName.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 24)}`;

  const linkId = await withTransaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into product_links (organization_id, product_name, mart_product_id, price_cents, currency, commission_rate, target_url)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        organizationId,
        input.productName.trim().slice(0, 200),
        martProductId,
        Math.round(input.priceCents),
        input.currency ?? "AUD",
        input.commissionRate ?? 0,
        input.targetUrl?.trim() || null,
      ],
    );
    const id = rows[0].id;
    for (const videoId of input.attachedVideoIds ?? []) {
      await tx.query(
        `insert into video_product_links (video_id, product_link_id) values ($1, $2) on conflict do nothing`,
        [videoId, id],
      );
    }
    return id;
  });

  const row = await queryOne<ProductLinkDbRow>(`${LINK_SELECT} where p.id = $1 group by p.id`, [linkId]);
  return { outcome: "success", link: mapLink(row!) };
}

export type ProductLinkMutationResult = { outcome: "success" } | { outcome: "not_found" };

export async function deleteProductLink(organizationId: string, linkId: string): Promise<ProductLinkMutationResult> {
  const result = await query(`delete from product_links where id = $1 and organization_id = $2 returning id`, [
    linkId,
    organizationId,
  ]);
  return result.length > 0 ? { outcome: "success" } : { outcome: "not_found" };
}

/** Real product links attached to a published video, for the "Shop this video" card —
 * only ever returns links whose owning organization actually still owns this video (a
 * link created for one channel can't leak onto a video that changed hands, though that
 * never happens today — cheap correctness, not a hypothetical fix). */
export async function getVideoProductLinks(
  videoId: string,
): Promise<Array<{ id: string; productName: string; priceCents: number; currency: string; targetUrl: string | null; timestampSeconds: number }>> {
  const rows = await query<{
    id: string;
    product_name: string;
    price_cents: number;
    currency: string;
    target_url: string | null;
    timestamp_seconds: number;
  }>(
    `select p.id, p.product_name, p.price_cents, p.currency, p.target_url, vpl.timestamp_seconds
     from video_product_links vpl
     join product_links p on p.id = vpl.product_link_id
     join videos v on v.id = vpl.video_id
     where vpl.video_id = $1 and p.organization_id = v.channel_id
     order by vpl.timestamp_seconds asc`,
    [videoId],
  );
  return rows.map((row) => ({
    id: row.id,
    productName: row.product_name,
    priceCents: row.price_cents,
    currency: row.currency,
    targetUrl: row.target_url,
    timestampSeconds: row.timestamp_seconds,
  }));
}

/** Real click tracking — `converted` is set by the caller when the click is a genuine
 * "opened the actual product" action (there's no real Mart checkout to confirm an actual
 * purchase against, so this counts intent to buy, not a settled sale; disclosed here
 * rather than silently treated as a real conversion). */
export async function recordProductLinkClick(linkId: string, converted: boolean): Promise<boolean> {
  const result = await query(
    converted
      ? `update product_links set clicks_count = clicks_count + 1, conversions_count = conversions_count + 1 where id = $1 returning id`
      : `update product_links set clicks_count = clicks_count + 1 where id = $1 returning id`,
    [linkId],
  );
  return result.length > 0;
}
