-- Supports an admin creating another account directly from /admin/users with a
-- temporary password (shown once), rather than that account needing to self-register
-- first. Meaningful only for local-password accounts today, same as password_hash
-- itself (see 20260915000001_local_password_auth.sql) — Auth0 has its own equivalent
-- concept (a forced password reset on a admin-invited user) that will replace this
-- flag's purpose once that lands, not extend it.
alter table accounts add column must_change_password boolean not null default false;
