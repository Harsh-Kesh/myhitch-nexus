-- Registration can now provision a real channel (organizations row) for any role that
-- implies one — see src/app/api/auth/register/route.ts. organizations.type was aligned to
-- the mock ChannelKind enum by 20260914000002 (creator/business/film-studio/education/
-- government/nonprofit/news), but account_roles has always supported advertiser and
-- producer as distinct roles with no ChannelKind counterpart. Extending the constraint
-- rather than folding those two into an existing type, since an advertiser's or
-- producer's channel is a materially different kind of org from a business's.
alter table organizations drop constraint organizations_type_check;
alter table organizations add constraint organizations_type_check
  check (type in ('creator', 'business', 'film-studio', 'education', 'government', 'nonprofit', 'news', 'advertiser', 'producer'));
