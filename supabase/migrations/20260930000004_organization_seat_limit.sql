-- Real Business-vs-Enterprise seat distinction (found during the 2026-09-24 platform
-- audit: teamInvitations.ts hardcoded the same 5-seat cap for every org uniformly, with
-- no column anywhere to hold a different number, so "Upgrade to Enterprise for unlimited
-- seats" had nothing behind it). Enterprise has no self-service checkout (it's a
-- "Contact Sales" lead, per pricing_plans.sql's own comment) — there's no automated
-- trigger that could set this correctly, so it's a real, admin-settable column a
-- super-admin raises (or nulls out, for unlimited) once an Enterprise deal actually
-- closes, not a value derived from anything the org itself controls.
alter table organizations add column if not exists seat_limit integer default 5;
comment on column organizations.seat_limit is 'Business team member seat cap. NULL means unlimited (Enterprise). Set by a super-admin, not self-service.';
