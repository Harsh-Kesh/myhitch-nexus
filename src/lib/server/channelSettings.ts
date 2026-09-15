// Server-only. Write path for a channel's own settings — branding, contact details, basic
// profile fields. Split out from catalogue.ts (public reads) and channelProvisioning.ts
// (registration-time creation) since this is the third, distinct concern: an authenticated
// owner editing an organization they already have.
import "server-only";
import { getChannelById, type ChannelDetail } from "./catalogue";
import { query, queryOne } from "./db";

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/;

// Deliberately excludes avatarUrl/bannerUrl: the settings page's "change banner/avatar"
// buttons only produce a browser-local blob: URL (there's no real file storage yet — P2's
// media pipeline), and persisting one would break the image for every other viewer and for
// the same viewer after reload. The UI disables those two controls for real channels rather
// than sending a value this type would reject.
export interface ChannelSettingsPatch {
  name?: string;
  handle?: string;
  tagline?: string;
  about?: string;
  contactEmail?: string;
  languages?: string[];
  country?: string;
}

export type UpdateOrganizationResult =
  | { outcome: "success"; channel: ChannelDetail }
  | { outcome: "invalid_handle" }
  | { outcome: "handle_taken" }
  | { outcome: "not_found" };

/** Whether `accountId` has any membership on `organizationId` — today that means "may edit
 * its settings". org_role (owner/editor/analyst) isn't distinguished yet since every
 * organization created by registration has exactly one member; revisit if/when inviting
 * teammates to a channel is built and an analyst shouldn't be able to rebrand it. */
export async function isChannelMember(accountId: string, organizationId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [accountId, organizationId],
  );
  return Boolean(row);
}

export async function updateOrganization(
  organizationId: string,
  patch: ChannelSettingsPatch,
): Promise<UpdateOrganizationResult> {
  const normalizedHandle = patch.handle?.trim().toLowerCase();
  if (normalizedHandle !== undefined && !HANDLE_PATTERN.test(normalizedHandle)) {
    return { outcome: "invalid_handle" };
  }
  if (normalizedHandle !== undefined) {
    const clash = await queryOne<{ id: string }>(
      `select id from organizations where handle = $1 and id != $2`,
      [normalizedHandle, organizationId],
    );
    if (clash) return { outcome: "handle_taken" };
  }

  const columns: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    columns.push(`${column} = $${values.length}`);
  };

  if (patch.name !== undefined) set("name", patch.name.trim().slice(0, 120));
  if (normalizedHandle !== undefined) set("handle", normalizedHandle);
  if (patch.tagline !== undefined) set("tagline", patch.tagline.trim().slice(0, 80));
  if (patch.about !== undefined) set("description", patch.about.trim().slice(0, 1000));
  if (patch.contactEmail !== undefined) set("business_email", patch.contactEmail.trim());
  if (patch.languages !== undefined) set("languages", patch.languages);
  if (patch.country !== undefined) set("country", patch.country);

  if (columns.length > 0) {
    values.push(organizationId);
    const rows = await query<{ id: string }>(
      `update organizations set ${columns.join(", ")} where id = $${values.length} returning id`,
      values,
    );
    if (rows.length === 0) return { outcome: "not_found" };
  }

  const channel = await getChannelById(organizationId);
  if (!channel) return { outcome: "not_found" };
  return { outcome: "success", channel };
}
