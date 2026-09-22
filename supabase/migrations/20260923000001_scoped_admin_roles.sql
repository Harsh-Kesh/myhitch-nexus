-- Scoped admin roles (ROLE-8/9/10, SEC-1) — docs/SRS-TRACEABILITY.md and
-- docs/DEVELOPMENT-PLAN.md's P4 entry both already commit to exactly three tiers
-- (moderator / finance-admin / super-admin), and docs/openapi.yaml already carries a
-- complete per-endpoint permission matrix using these exact names — this migration and
-- the code change alongside it are the first time any of that is actually enforced.
-- Every account that previously held the single flat 'admin' role becomes 'super-admin'
-- (preserves its current full access exactly), then 'admin' is dropped as a grantable
-- value — a real admin route continuing to check for it after this would silently lock
-- every admin out, so this must land in the same change as the code that checks the new
-- tiers, not on its own.
--
-- Widen the constraint first (to admit 'super-admin' alongside the still-allowed
-- 'admin'), THEN migrate the data, THEN drop 'admin' — the data migration below would
-- itself violate the old constraint if it ran before this first alter.
alter table account_roles drop constraint account_roles_role_check;
alter table account_roles add constraint account_roles_role_check
  check (role in (
    'viewer', 'creator', 'business', 'advertiser', 'producer', 'education', 'organisation',
    'admin', 'moderator', 'finance-admin', 'super-admin'
  ));

update account_roles set role = 'super-admin' where role = 'admin';

alter table account_roles drop constraint account_roles_role_check;
alter table account_roles add constraint account_roles_role_check
  check (role in (
    'viewer', 'creator', 'business', 'advertiser', 'producer', 'education', 'organisation',
    'moderator', 'finance-admin', 'super-admin'
  ));
