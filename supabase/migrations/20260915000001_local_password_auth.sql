-- Temporary local sign-in, so the rest of the app (watchlist/ratings/comments/RBAC —
-- everything that needs a real signed-in account) doesn't have to wait on Auth0 shared-
-- tenant access (docs/DEVELOPMENT-PLAN.md §9, blocker #2). Deliberately scoped as a single
-- swappable seam: `accounts.password_hash` and this file's `sessions` table are the ONLY
-- Auth0-shaped things replaced later — sessions/RBAC themselves are permanent and don't
-- change when the password check moves to Auth0's Resource Owner Password Grant (see
-- src/lib/server/localPassword.ts's header comment for the exact swap point).
--
-- password_hash is nullable: an Auth0-only or social-only account (once those exist) will
-- never have one, and a local account created before Auth0 lands can have this cleared
-- once its credential moves there.
alter table accounts add column password_hash text;

-- Opaque bearer sessions, not JWTs — a bearer token embedded in a cookie needs to be
-- revocable (logout, password change, a compromised device) without waiting for a token
-- to expire, which a self-contained JWT can't do without an extra denylist anyway. Only
-- token_hash is stored (sha-256 of the actual cookie value), so reading this table can
-- never hand back a usable session, matching the password_hash-not-password treatment
-- of accounts above.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text,
  ip text
);

create index sessions_account_id_idx on sessions(account_id);
create index sessions_token_hash_idx on sessions(token_hash);

alter table sessions enable row level security;
