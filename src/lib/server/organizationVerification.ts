// Server-only. Real organisation verification, free half — docs/DEVELOPMENT-PLAN.md's
// 2026-09-17 entry. Collects the same fields the client's Business Registration &
// Verification design calls for, runs the one free automated check (ABN Lookup), and
// submits to an honest 'pending' state — organizations.verification_status already
// existed (20260914000004) but nothing real ever wrote to it before this. ID
// verification, bank validation and risk/fraud screening are deliberately not built
// here: they need paid KYC/KYB vendors not yet approved.
import "server-only";
import { query, queryOne } from "./db";
import { lookupAbn, type AbnLookupResult } from "./abnLookup";
import { uploadBusinessDocument, createDocumentUrl } from "./storage";

async function isOrgMember(accountId: string, organizationId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [accountId, organizationId],
  );
  return Boolean(row);
}

export interface VerificationRow {
  organizationId: string;
  legalEntityName: string | null;
  tradingName: string | null;
  abn: string | null;
  acn: string | null;
  entityType: string | null;
  gstRegistered: boolean | null;
  businessRegistrationDate: string | null;
  countryOfRegistration: string;
  registeredAddress: string | null;
  principalAddress: string | null;
  operatingLocations: string | null;
  addressSameAsRegistered: boolean;
  contactFullName: string | null;
  contactPosition: string | null;
  contactEmail: string | null;
  contactMobile: string | null;
  authorisedPersonName: string | null;
  authorisedPersonPosition: string | null;
  industry: string | null;
  businessDescription: string | null;
  website: string | null;
  platforms: string[];
  productsServices: string | null;
  informationAccurate: boolean;
  authorityConfirmed: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  abnLookupCheckedAt: string | null;
  abnLookupStatus: string | null;
  abnLookupEntityName: string | null;
  abnLookupEntityType: string | null;
  abnLookupGstEffectiveFrom: string | null;
  abnLookupState: string | null;
  abnLookupPostcode: string | null;
  abnLookupAcn: string | null;
  abnLookupStatusEffectiveFrom: string | null;
  submittedAt: string | null;
  status: string; // organizations.verification_status
}

interface VerificationDbRow {
  organization_id: string;
  legal_entity_name: string | null;
  trading_name: string | null;
  abn: string | null;
  acn: string | null;
  entity_type: string | null;
  gst_registered: boolean | null;
  business_registration_date: string | null;
  country_of_registration: string;
  registered_address: string | null;
  principal_address: string | null;
  operating_locations: string | null;
  address_same_as_registered: boolean;
  contact_full_name: string | null;
  contact_position: string | null;
  contact_email: string | null;
  contact_mobile: string | null;
  authorised_person_name: string | null;
  authorised_person_position: string | null;
  industry: string | null;
  business_description: string | null;
  website: string | null;
  platforms: string[];
  products_services: string | null;
  information_accurate: boolean;
  authority_confirmed: boolean;
  terms_accepted: boolean;
  privacy_accepted: boolean;
  abn_lookup_checked_at: string | null;
  abn_lookup_status: string | null;
  abn_lookup_entity_name: string | null;
  abn_lookup_entity_type: string | null;
  abn_lookup_gst_effective_from: string | null;
  abn_lookup_state: string | null;
  abn_lookup_postcode: string | null;
  abn_lookup_acn: string | null;
  abn_lookup_status_effective_from: string | null;
  submitted_at: string | null;
}

function mapRow(row: VerificationDbRow, status: string): VerificationRow {
  return {
    organizationId: row.organization_id,
    legalEntityName: row.legal_entity_name,
    tradingName: row.trading_name,
    abn: row.abn,
    acn: row.acn,
    entityType: row.entity_type,
    gstRegistered: row.gst_registered,
    businessRegistrationDate: row.business_registration_date,
    countryOfRegistration: row.country_of_registration,
    registeredAddress: row.registered_address,
    principalAddress: row.principal_address,
    operatingLocations: row.operating_locations,
    addressSameAsRegistered: row.address_same_as_registered,
    contactFullName: row.contact_full_name,
    contactPosition: row.contact_position,
    contactEmail: row.contact_email,
    contactMobile: row.contact_mobile,
    authorisedPersonName: row.authorised_person_name,
    authorisedPersonPosition: row.authorised_person_position,
    industry: row.industry,
    businessDescription: row.business_description,
    website: row.website,
    platforms: row.platforms,
    productsServices: row.products_services,
    informationAccurate: row.information_accurate,
    authorityConfirmed: row.authority_confirmed,
    termsAccepted: row.terms_accepted,
    privacyAccepted: row.privacy_accepted,
    abnLookupCheckedAt: row.abn_lookup_checked_at,
    abnLookupStatus: row.abn_lookup_status,
    abnLookupEntityName: row.abn_lookup_entity_name,
    abnLookupEntityType: row.abn_lookup_entity_type,
    abnLookupGstEffectiveFrom: row.abn_lookup_gst_effective_from,
    abnLookupState: row.abn_lookup_state,
    abnLookupPostcode: row.abn_lookup_postcode,
    abnLookupAcn: row.abn_lookup_acn,
    abnLookupStatusEffectiveFrom: row.abn_lookup_status_effective_from,
    submittedAt: row.submitted_at,
    status,
  };
}

const EMPTY_ROW: Omit<VerificationDbRow, "organization_id"> = {
  legal_entity_name: null,
  trading_name: null,
  abn: null,
  acn: null,
  entity_type: null,
  gst_registered: null,
  business_registration_date: null,
  country_of_registration: "AU",
  registered_address: null,
  principal_address: null,
  operating_locations: null,
  address_same_as_registered: true,
  contact_full_name: null,
  contact_position: null,
  contact_email: null,
  contact_mobile: null,
  authorised_person_name: null,
  authorised_person_position: null,
  industry: null,
  business_description: null,
  website: null,
  platforms: [],
  products_services: null,
  information_accurate: false,
  authority_confirmed: false,
  terms_accepted: false,
  privacy_accepted: false,
  abn_lookup_checked_at: null,
  abn_lookup_status: null,
  abn_lookup_entity_name: null,
  abn_lookup_entity_type: null,
  abn_lookup_gst_effective_from: null,
  abn_lookup_state: null,
  abn_lookup_postcode: null,
  abn_lookup_acn: null,
  abn_lookup_status_effective_from: null,
  submitted_at: null,
};

export type GetVerificationResult =
  | { outcome: "success"; data: VerificationRow }
  | { outcome: "not_member" };

export async function getVerification(accountId: string, organizationId: string): Promise<GetVerificationResult> {
  if (!(await isOrgMember(accountId, organizationId))) {
    return { outcome: "not_member" };
  }
  const [verificationRow, orgRow] = await Promise.all([
    queryOne<VerificationDbRow>(`select * from organization_verification where organization_id = $1`, [
      organizationId,
    ]),
    queryOne<{ verification_status: string }>(`select verification_status from organizations where id = $1`, [
      organizationId,
    ]),
  ]);
  const status = orgRow?.verification_status ?? "unverified";
  return {
    outcome: "success",
    data: verificationRow ? mapRow(verificationRow, status) : mapRow({ organization_id: organizationId, ...EMPTY_ROW }, status),
  };
}

// Every field is optional here — this saves a work-in-progress draft, not a submission.
// Only submitVerification() below enforces completeness.
export interface VerificationDraftInput {
  legalEntityName?: string;
  tradingName?: string;
  abn?: string;
  acn?: string;
  entityType?: string;
  gstRegistered?: boolean;
  businessRegistrationDate?: string | null;
  countryOfRegistration?: string;
  registeredAddress?: string;
  principalAddress?: string;
  operatingLocations?: string;
  addressSameAsRegistered?: boolean;
  contactFullName?: string;
  contactPosition?: string;
  contactEmail?: string;
  contactMobile?: string;
  authorisedPersonName?: string;
  authorisedPersonPosition?: string;
  industry?: string;
  businessDescription?: string;
  website?: string;
  platforms?: string[];
  productsServices?: string;
  informationAccurate?: boolean;
  authorityConfirmed?: boolean;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
}

const DRAFT_COLUMNS: Record<keyof VerificationDraftInput, string> = {
  legalEntityName: "legal_entity_name",
  tradingName: "trading_name",
  abn: "abn",
  acn: "acn",
  entityType: "entity_type",
  gstRegistered: "gst_registered",
  businessRegistrationDate: "business_registration_date",
  countryOfRegistration: "country_of_registration",
  registeredAddress: "registered_address",
  principalAddress: "principal_address",
  operatingLocations: "operating_locations",
  addressSameAsRegistered: "address_same_as_registered",
  contactFullName: "contact_full_name",
  contactPosition: "contact_position",
  contactEmail: "contact_email",
  contactMobile: "contact_mobile",
  authorisedPersonName: "authorised_person_name",
  authorisedPersonPosition: "authorised_person_position",
  industry: "industry",
  businessDescription: "business_description",
  website: "website",
  platforms: "platforms",
  productsServices: "products_services",
  informationAccurate: "information_accurate",
  authorityConfirmed: "authority_confirmed",
  termsAccepted: "terms_accepted",
  privacyAccepted: "privacy_accepted",
};

export type SaveDraftResult = { outcome: "success" } | { outcome: "not_member" } | { outcome: "already_submitted" };

export async function saveVerificationDraft(
  accountId: string,
  organizationId: string,
  input: VerificationDraftInput,
): Promise<SaveDraftResult> {
  if (!(await isOrgMember(accountId, organizationId))) {
    return { outcome: "not_member" };
  }
  const existing = await queryOne<{ submitted_at: string | null }>(
    `select submitted_at from organization_verification where organization_id = $1`,
    [organizationId],
  );
  if (existing?.submitted_at) {
    return { outcome: "already_submitted" };
  }

  // Editing the ABN invalidates any prior lookup result — otherwise a real Active lookup
  // against one ABN would stay attached after the user typed in a different one, and
  // submitVerification()'s gate (below) would wrongly treat the new, unchecked ABN as
  // verified. Compared against the currently stored value, not just "was abn included in
  // this save" — a save that repeats the already-verified ABN keeps its lookup intact.
  if (input.abn !== undefined) {
    const currentAbn = await queryOne<{ abn: string | null }>(
      `select abn from organization_verification where organization_id = $1`,
      [organizationId],
    );
    if (currentAbn && currentAbn.abn !== input.abn) {
      await query(
        `update organization_verification
         set abn_lookup_status = null, abn_lookup_checked_at = null, abn_lookup_entity_name = null
         where organization_id = $1`,
        [organizationId],
      );
    }
  }

  const entries = Object.entries(input).filter(([, value]) => value !== undefined) as Array<
    [keyof VerificationDraftInput, string | boolean | string[]]
  >;
  if (entries.length === 0) {
    await query(
      `insert into organization_verification (organization_id) values ($1) on conflict do nothing`,
      [organizationId],
    );
    return { outcome: "success" };
  }

  const setClauses = entries.map(([key], index) => `${DRAFT_COLUMNS[key]} = $${index + 2}`);
  const insertColumns = entries.map(([key]) => DRAFT_COLUMNS[key]);
  const insertPlaceholders = entries.map((_, index) => `$${index + 2}`);
  const values = entries.map(([, value]) => value);

  await query(
    `insert into organization_verification (organization_id, ${insertColumns.join(", ")})
     values ($1, ${insertPlaceholders.join(", ")})
     on conflict (organization_id) do update set ${setClauses.join(", ")}`,
    [organizationId, ...values],
  );
  return { outcome: "success" };
}

export type AbnLookupOutcome =
  | { outcome: "success"; result: AbnLookupResult }
  | { outcome: "not_member" }
  | { outcome: "already_submitted" };

export async function runAbnLookup(accountId: string, organizationId: string, abn: string): Promise<AbnLookupOutcome> {
  if (!(await isOrgMember(accountId, organizationId))) {
    return { outcome: "not_member" };
  }
  const existing = await queryOne<{ submitted_at: string | null }>(
    `select submitted_at from organization_verification where organization_id = $1`,
    [organizationId],
  );
  if (existing?.submitted_at) {
    return { outcome: "already_submitted" };
  }

  const result = await lookupAbn(abn);
  await query(
    `insert into organization_verification (
       organization_id, abn, abn_lookup_checked_at, abn_lookup_status, abn_lookup_entity_name,
       abn_lookup_entity_type, abn_lookup_gst_effective_from, abn_lookup_state, abn_lookup_postcode,
       abn_lookup_acn, abn_lookup_status_effective_from
     ) values ($1, $2, now(), $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (organization_id) do update set
       abn = $2, abn_lookup_checked_at = now(), abn_lookup_status = $3, abn_lookup_entity_name = $4,
       abn_lookup_entity_type = $5, abn_lookup_gst_effective_from = $6, abn_lookup_state = $7,
       abn_lookup_postcode = $8, abn_lookup_acn = $9, abn_lookup_status_effective_from = $10`,
    [
      organizationId,
      result.abn,
      result.found ? result.abnStatus : result.message,
      result.entityName || null,
      result.entityTypeName || null,
      result.gstEffectiveFrom,
      result.addressState || null,
      result.addressPostcode || null,
      result.acn || null,
      result.abnStatusEffectiveFrom,
    ],
  );
  return { outcome: "success", result };
}

export type UploadDocumentOutcome =
  | { outcome: "success"; id: string; fileName: string }
  | { outcome: "not_member" };

export async function uploadVerificationDocument(
  accountId: string,
  organizationId: string,
  documentType: "business_registration" | "licence" | "insurance" | "other",
  fileName: string,
  file: Buffer,
  contentType: string,
): Promise<UploadDocumentOutcome> {
  if (!(await isOrgMember(accountId, organizationId))) {
    return { outcome: "not_member" };
  }
  const { path } = await uploadBusinessDocument(organizationId, fileName, file, contentType);
  const rows = await query<{ id: string }>(
    `insert into organization_documents (organization_id, document_type, file_path, file_name, uploaded_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [organizationId, documentType, path, fileName, accountId],
  );
  return { outcome: "success", id: rows[0].id, fileName };
}

export interface DocumentSummary {
  id: string;
  documentType: string;
  fileName: string;
  uploadedAt: string;
  url: string;
}

export async function listVerificationDocuments(
  accountId: string,
  organizationId: string,
): Promise<{ outcome: "success"; documents: DocumentSummary[] } | { outcome: "not_member" }> {
  if (!(await isOrgMember(accountId, organizationId))) {
    return { outcome: "not_member" };
  }
  const rows = await query<{ id: string; document_type: string; file_name: string; file_path: string; uploaded_at: string }>(
    `select id, document_type, file_name, file_path, uploaded_at from organization_documents
     where organization_id = $1 order by uploaded_at desc`,
    [organizationId],
  );
  const documents = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      documentType: row.document_type,
      fileName: row.file_name,
      uploadedAt: row.uploaded_at,
      url: await createDocumentUrl(row.file_path),
    })),
  );
  return { outcome: "success", documents };
}

export type SubmitVerificationOutcome =
  | { outcome: "success" }
  | { outcome: "not_member" }
  | { outcome: "not_eligible" }
  | { outcome: "already_submitted" }
  | { outcome: "invalid"; reason: string };

/** The one real gate on this form (mirrors publishVideo()'s AC-3 gate): required fields
 * and every declaration checkbox must be present before this can move to 'pending' —
 * everything else this session already applies to writes that change what a real
 * account can do. */
export async function submitVerification(accountId: string, organizationId: string): Promise<SubmitVerificationOutcome> {
  if (!(await isOrgMember(accountId, organizationId))) {
    return { outcome: "not_member" };
  }
  // Client decision, 2026-09-25: no verification flow for creators — Nexus Creator is a
  // free, open-signup tier (like YouTube/TikTok's regular creator accounts, not their
  // separate manually-reviewed verification programs), so there's deliberately no path
  // for a creator channel to earn a verified badge at all. See catalogue.ts's
  // computeVerifiedBadge() for the display-side half of this same rule.
  const org = await queryOne<{ type: string }>(`select type from organizations where id = $1`, [organizationId]);
  if (org?.type === "creator") {
    return { outcome: "not_eligible" };
  }
  const row = await queryOne<VerificationDbRow>(
    `select * from organization_verification where organization_id = $1`,
    [organizationId],
  );
  if (row?.submitted_at) {
    return { outcome: "already_submitted" };
  }
  if (!row?.legal_entity_name?.trim()) {
    return { outcome: "invalid", reason: "Legal entity name is required." };
  }
  if (!row.abn?.trim()) {
    return { outcome: "invalid", reason: "An ABN is required." };
  }
  // The automated verification badge is a real trust signal — it must be backed by a
  // real, successful Australian Business Register lookup for the currently-declared ABN
  // (see runAbnLookup()), not just a non-empty text field. saveVerificationDraft() clears
  // these two columns whenever the ABN is edited, so a stale lookup from a different,
  // previously-typed ABN can never satisfy this gate.
  if (!row.abn_lookup_checked_at || row.abn_lookup_status?.trim().toLowerCase() !== "active") {
    return {
      outcome: "invalid",
      reason: "Run the ABN lookup and confirm it returns an active business before submitting.",
    };
  }
  if (!row.contact_full_name?.trim() || !row.contact_email?.trim()) {
    return { outcome: "invalid", reason: "A primary contact name and email are required." };
  }
  if (!row.authorised_person_name?.trim()) {
    return { outcome: "invalid", reason: "An authorised person is required." };
  }
  if (!row.information_accurate || !row.authority_confirmed || !row.terms_accepted || !row.privacy_accepted) {
    return { outcome: "invalid", reason: "All declaration checkboxes must be accepted." };
  }

  await query(`update organization_verification set submitted_at = now() where organization_id = $1`, [
    organizationId,
  ]);
  // Automated verification: instant "verified" status requires no human review, but only
  // because the gate above already required a real, successful ABR lookup — this is not
  // "any string that looks number-shaped."
  await query(`update organizations set verification_status = 'verified', verified = true where id = $1`, [organizationId]);
  return { outcome: "success" };
}
