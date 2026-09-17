// Server-only. The Australian Business Register's free ABN Lookup web service
// (abr.business.gov.au) — the one automated, no-cost check in organisation
// verification (docs/DEVELOPMENT-PLAN.md's 2026-09-17 entry). Registration for a GUID
// is free; ID verification, bank validation and risk screening in the same design all
// need paid vendors and are deliberately not built here.
import "server-only";

const ABR_BASE_URL = "https://abr.business.gov.au/json/AbnDetails.aspx";

export interface AbnLookupResult {
  found: boolean;
  message: string;
  abn: string;
  abnStatus: string;
  abnStatusEffectiveFrom: string | null;
  acn: string;
  entityName: string;
  entityTypeCode: string;
  entityTypeName: string;
  gstEffectiveFrom: string | null;
  addressState: string;
  addressPostcode: string;
}

interface AbrRawResponse {
  Abn: string;
  AbnStatus: string;
  AbnStatusEffectiveFrom: string | null;
  Acn: string;
  AddressPostcode: string;
  AddressState: string;
  EntityName: string;
  EntityTypeCode: string;
  EntityTypeName: string;
  Gst: string | null;
  Message: string;
}

// The service always wraps its response as JSONP (`callback({...})`), even with no
// `callback` param supplied — confirmed live against the real endpoint, not assumed
// from docs. Strip the wrapper rather than requesting a `text/plain` response the
// service doesn't actually offer.
function stripJsonp(text: string): AbrRawResponse {
  const match = /^[^(]*\((.*)\)\s*;?\s*$/s.exec(text.trim());
  if (!match) {
    throw new Error("Unexpected response from ABN Lookup.");
  }
  return JSON.parse(match[1]) as AbrRawResponse;
}

export async function lookupAbn(rawAbn: string): Promise<AbnLookupResult> {
  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid) {
    throw new Error("ABN Lookup isn't configured on this server.");
  }
  const abn = rawAbn.replace(/\s+/g, "");
  const url = `${ABR_BASE_URL}?abn=${encodeURIComponent(abn)}&guid=${encodeURIComponent(guid)}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`ABN Lookup request failed (${response.status}).`);
  }
  const data = stripJsonp(await response.text());

  // An invalid/unknown ABN comes back as 200 OK with empty fields and a Message, not an
  // HTTP error — confirmed live (e.g. "Search text is not a valid ABN or ACN").
  if (!data.Abn || data.Message) {
    return {
      found: false,
      message: data.Message || "ABN not found.",
      abn,
      abnStatus: "",
      abnStatusEffectiveFrom: null,
      acn: "",
      entityName: "",
      entityTypeCode: "",
      entityTypeName: "",
      gstEffectiveFrom: null,
      addressState: "",
      addressPostcode: "",
    };
  }

  return {
    found: true,
    message: "",
    abn: data.Abn,
    abnStatus: data.AbnStatus,
    abnStatusEffectiveFrom: data.AbnStatusEffectiveFrom,
    acn: data.Acn,
    entityName: data.EntityName,
    entityTypeCode: data.EntityTypeCode,
    entityTypeName: data.EntityTypeName,
    gstEffectiveFrom: data.Gst,
    addressState: data.AddressState,
    addressPostcode: data.AddressPostcode,
  };
}
