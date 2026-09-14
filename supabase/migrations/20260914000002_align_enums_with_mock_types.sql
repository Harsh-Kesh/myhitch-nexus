-- The Phase 0 migration (20260906000001) wrote organizations.type and
-- account_roles.role from the SRS's prose descriptions rather than the actual
-- mock-api/types.ts enums, and drifted from them in two places:
--   - ChannelKind (organizations.type) has 7 values; we only had 5, missing
--     'film-studio' and 'news'.
--   - UserRole (account_roles.role) names two roles differently:
--     'education_provider' -> 'education', 'government_nonprofit' -> 'organisation'.
-- Both tables are still empty, so this is a plain constraint swap, not a data
-- migration. Aligning now avoids a translation layer between our schema and
-- the real TypeScript types once routes start reading/writing them.

alter table organizations drop constraint organizations_type_check;
alter table organizations add constraint organizations_type_check
  check (type in ('creator', 'business', 'film-studio', 'education', 'government', 'nonprofit', 'news'));

alter table account_roles drop constraint account_roles_role_check;
alter table account_roles add constraint account_roles_role_check
  check (role in ('viewer', 'creator', 'business', 'advertiser', 'producer', 'education', 'organisation', 'admin'));
