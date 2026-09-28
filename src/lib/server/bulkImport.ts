// Server-only. Distributor/Enterprise bulk metadata import — was 100% mock
// (mock-api/index.ts's validateBulkImport() always fabricated the same 12 hardcoded
// rows for any account, real or not, and "confirm import" was a toast with no DB
// write). Real CSV parsing + validation here; a manifest row has no video file
// attached (that's a separate real upload, same as any other video), so a valid row
// stages a real `videos` draft with metadata only — status 'draft',
// processing_status 'none' (its actual default), no master_asset_path yet. The
// creator finishes it later from Studio Content's "Edit details" or by attaching a
// master file, exactly like any other draft.
//
// XML manifests aren't supported — there's no real spec to parse against (the UI
// copy names "Media Manifest XML" but nothing in this codebase defines that format),
// so building a parser for it would be inventing requirements. CSV only, add XML if a
// real manifest format is specified.
import "server-only";
import { queryOne } from "./db";
import { isChannelMember } from "./channelSettings";
import { pickGradient } from "../utils";

const VALID_CONTENT_TYPES = [
  "commercial", "film", "entertainment", "education", "news", "documentary",
  "live", "tourism", "government", "nonprofit", "user-generated", "music", "podcast",
];
const VALID_AGE_RATINGS = ["U", "PG", "12", "15", "18"];
const VALID_ACCESS_MODELS = ["free", "ad-supported", "subscription"];

export interface BulkImportParsedRow {
  id: string;
  fileName: string;
  title: string;
  contentType: string;
  language: string;
  releaseDate: string;
  ageRating: string;
  accessModel: string;
  status: "ready" | "warning" | "error";
  message?: string;
}

function slugify(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "untitled";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Handles quoted fields with embedded commas — real manifests exported from a
 * spreadsheet commonly quote titles containing commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

const EXPECTED_COLUMNS = ["filename", "title", "contenttype", "language", "releasedate", "agerating", "accessmodel"];

export type ParseBulkImportResult =
  | { outcome: "success"; rows: BulkImportParsedRow[] }
  | { outcome: "invalid"; reason: string };

/** Real parse + per-row validation of an uploaded CSV manifest's raw text content — no
 * DB write here, this only backs the review table (see stageBulkImportDrafts for the
 * commit step). */
export function parseBulkImportCsv(text: string): ParseBulkImportResult {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { outcome: "invalid", reason: "The file is empty." };
  }
  const header = parseCsvLine(lines[0]).map((col) => col.toLowerCase().replace(/[^a-z]/g, ""));
  const missing = EXPECTED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    return {
      outcome: "invalid",
      reason: `Missing column(s): ${missing.join(", ")}. Expected: fileName, title, contentType, language, releaseDate, ageRating, accessModel.`,
    };
  }
  const colIndex = (col: string) => header.indexOf(col);

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) {
    return { outcome: "invalid", reason: "The file has a header row but no data rows." };
  }
  if (dataLines.length > 500) {
    return { outcome: "invalid", reason: "Manifests are limited to 500 rows at a time." };
  }

  const rows: BulkImportParsedRow[] = dataLines.map((line, index) => {
    const cells = parseCsvLine(line);
    const fileName = cells[colIndex("filename")] ?? "";
    const title = cells[colIndex("title")] ?? "";
    const contentType = cells[colIndex("contenttype")]?.toLowerCase() ?? "";
    const language = cells[colIndex("language")] ?? "";
    const releaseDate = cells[colIndex("releasedate")] ?? "";
    const ageRating = cells[colIndex("agerating")] ?? "";
    const accessModel = cells[colIndex("accessmodel")]?.toLowerCase() ?? "";

    const problems: string[] = [];
    if (title.trim().length < 3) problems.push("title must be at least 3 characters");
    if (!VALID_CONTENT_TYPES.includes(contentType)) problems.push(`unrecognized contentType "${contentType}"`);
    if (!VALID_AGE_RATINGS.includes(ageRating)) problems.push(`unrecognized ageRating "${ageRating}"`);
    if (!VALID_ACCESS_MODELS.includes(accessModel)) {
      problems.push(
        accessModel === "rent" || accessModel === "buy" || accessModel === "ppv"
          ? `"${accessModel}" pricing was retired — use free, ad-supported or subscription`
          : `unrecognized accessModel "${accessModel}"`,
      );
    }
    const releaseDateValid = releaseDate === "" || !Number.isNaN(Date.parse(releaseDate));
    const warnings: string[] = [];
    if (!releaseDateValid) warnings.push("releaseDate isn't a recognizable date and will be left blank");
    if (!fileName.trim()) warnings.push("no fileName given");

    const status: BulkImportParsedRow["status"] =
      problems.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ready";

    return {
      id: `row_${index + 1}`,
      fileName: fileName || `row-${index + 1}`,
      title,
      contentType,
      language,
      releaseDate: releaseDateValid ? releaseDate : "",
      ageRating,
      accessModel,
      status,
      message: [...problems, ...warnings].join("; ") || undefined,
    };
  });

  return { outcome: "success", rows };
}

export type StageBulkImportResult =
  | { outcome: "success"; staged: number }
  | { outcome: "not_channel_member" };

/** Commits the reviewed (non-error) rows as real `videos` drafts — metadata only, no
 * master file. Deliberately skips categories/rights/pricing (a draft doesn't need
 * them; publishVideo() will require them same as any other video before it can
 * actually publish) rather than guessing a category mapping the manifest doesn't
 * provide. */
export async function stageBulkImportDrafts(
  accountId: string,
  channelId: string,
  rows: BulkImportParsedRow[],
): Promise<StageBulkImportResult> {
  if (!(await isChannelMember(accountId, channelId))) {
    return { outcome: "not_channel_member" };
  }
  const importable = rows.filter((row) => row.status !== "error");
  let staged = 0;
  for (const row of importable) {
    const slug = slugify(row.title);
    await queryOne(
      `insert into videos (slug, channel_id, title, content_type, status, release_date, language, poster_gradient)
       values ($1, $2, $3, $4, 'draft', $5, $6, $7)`,
      [
        slug,
        channelId,
        row.title.trim().slice(0, 200),
        row.contentType,
        row.releaseDate || null,
        row.language || null,
        pickGradient(slug),
      ],
    );
    staged++;
  }
  return { outcome: "success", staged };
}
