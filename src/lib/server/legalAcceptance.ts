// Server-only. Real consent capture (DEC-12, FR-6.6.4) — tracks terms, privacy, and
// community guidelines acknowledgements across registration and version changes.
import "server-only";
import { query, queryOne } from "./db";

export type LegalDocumentType = "terms_and_privacy" | "community_guidelines";

export async function recordLegalAcceptance(
  accountId: string,
  ip: string | null,
  documentType: LegalDocumentType = "terms_and_privacy",
  documentVersion = "pending-legal-text",
): Promise<void> {
  await query(
    `insert into legal_acceptances (account_id, document_type, document_version, ip) values ($1, $2, $3, $4)`,
    [accountId, documentType, documentVersion, ip],
  );
}

export async function hasAcceptedGuidelines(accountId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from legal_acceptances where account_id = $1 and document_type = 'community_guidelines' limit 1`,
    [accountId],
  );
  return Boolean(row);
}

export async function getLegalAcceptances(accountId: string): Promise<Array<{ documentType: string; documentVersion: string; acceptedAt: string }>> {
  const rows = await query<{ document_type: string; document_version: string; accepted_at: string }>(
    `select document_type, document_version, accepted_at from legal_acceptances where account_id = $1 order by accepted_at desc`,
    [accountId],
  );
  return rows.map((r) => ({
    documentType: r.document_type,
    documentVersion: r.document_version,
    acceptedAt: r.accepted_at,
  }));
}
