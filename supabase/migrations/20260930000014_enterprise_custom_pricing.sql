-- Nexus Enterprise had a real approval gate but no real pricing/billing behind it — a
-- super-admin could only flip a pending application straight to "active" for free.
-- Enterprise pricing is genuinely custom per customer (no fixed catalog price like
-- Business's $29/mo), so a super-admin now sets the negotiated price/interval when
-- approving, and the customer completes a real Stripe subscription for that exact
-- amount before real access unlocks — the same subscriptions table premium/family/
-- business already use, just with the price supplied per-organization instead of from
-- a fixed catalog.
alter table organizations add column if not exists enterprise_price_minor integer check (enterprise_price_minor is null or enterprise_price_minor > 0);
alter table organizations add column if not exists enterprise_billing_interval text check (enterprise_billing_interval in ('month', 'year'));

alter table organizations drop constraint if exists organizations_enterprise_status_check;
alter table organizations add constraint organizations_enterprise_status_check
  check (enterprise_status in ('pending', 'awaiting_payment', 'active', 'rejected'));

alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('premium', 'family', 'business', 'enterprise'));
