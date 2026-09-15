// Server-only. Write path for a signed-in account's own profile fields — the account-level
// counterpart to channelSettings.ts. Deliberately excludes avatarUrl for the same reason:
// it's a browser-local blob: URL with nowhere real to persist to until real file storage
// exists, and writing one into accounts.avatar_url would break the image for every other
// viewer and for the same viewer after reload.
import "server-only";
import { query, queryOne } from "./db";

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const EMAIL_PATTERN = /.+@.+\..+/;

export interface AccountSettingsPatch {
  name?: string;
  email?: string;
  handle?: string;
  country?: string;
  language?: string;
}

export type UpdateAccountResult =
  | { outcome: "success" }
  | { outcome: "invalid_email" }
  | { outcome: "email_taken" }
  | { outcome: "invalid_handle" }
  | { outcome: "handle_taken" }
  | { outcome: "not_found" };

export async function updateAccount(
  accountId: string,
  patch: AccountSettingsPatch,
): Promise<UpdateAccountResult> {
  const normalizedEmail = patch.email?.trim().toLowerCase();
  if (normalizedEmail !== undefined) {
    if (!EMAIL_PATTERN.test(normalizedEmail)) return { outcome: "invalid_email" };
    const clash = await queryOne<{ id: string }>(
      `select id from accounts where lower(email) = $1 and id != $2`,
      [normalizedEmail, accountId],
    );
    if (clash) return { outcome: "email_taken" };
  }

  const normalizedHandle = patch.handle?.trim().toLowerCase();
  if (normalizedHandle !== undefined) {
    if (!HANDLE_PATTERN.test(normalizedHandle)) return { outcome: "invalid_handle" };
    const clash = await queryOne<{ id: string }>(
      `select id from accounts where handle = $1 and id != $2`,
      [normalizedHandle, accountId],
    );
    if (clash) return { outcome: "handle_taken" };
  }

  const columns: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    columns.push(`${column} = $${values.length}`);
  };

  if (patch.name !== undefined) set("full_name", patch.name.trim().slice(0, 120));
  if (normalizedEmail !== undefined) set("email", normalizedEmail);
  if (normalizedHandle !== undefined) set("handle", normalizedHandle);
  if (patch.country !== undefined) set("country", patch.country);
  if (patch.language !== undefined) set("preferred_language", patch.language);

  if (columns.length === 0) return { outcome: "success" };

  values.push(accountId);
  const rows = await query<{ id: string }>(
    `update accounts set ${columns.join(", ")} where id = $${values.length} returning id`,
    values,
  );
  if (rows.length === 0) return { outcome: "not_found" };
  return { outcome: "success" };
}
