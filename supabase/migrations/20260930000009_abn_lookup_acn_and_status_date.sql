-- The real ABN lookup (abnLookup.ts) has always returned an ACN and an
-- AbnStatusEffectiveFrom date, but runAbnLookup() only ever persisted status/entity
-- name/entity type/GST/state/postcode — ACN and the status date were fetched from the
-- real ABR and then silently discarded. Found live 2026-09-26: a business asked why the
-- lookup wasn't filling in every field it has ("only the ones they haven't submitted"),
-- and the ACN/registration-date fields were the two genuinely missing pieces (the other
-- fields were already fetched and just never wired into the draft-fill logic — see the
-- same commit's fix to business/verification/page.tsx).
alter table organization_verification add column if not exists abn_lookup_acn text;
alter table organization_verification add column if not exists abn_lookup_status_effective_from date;
