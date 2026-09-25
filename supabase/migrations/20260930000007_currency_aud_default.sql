-- Real currency default switched from GBP to AUD (client decision, 2026-09-25 — this is
-- an Australian platform: real org verification already uses the Australian Business
-- Register/ABN lookup; GBP was carried over from early scaffolding, never an intentional
-- choice). This migration only widens what's *allowed* and changes what new rows default
-- to — it does not rewrite existing rows. A handful of real (test-mode) Stripe
-- subscriptions/entitlements/campaigns already exist with currency = 'GBP', accurately
-- recording what Stripe actually charged in test mode at the time; silently rewriting
-- that would make the stored currency lie about the real transaction. New activity goes
-- through the AUD-defaulted application code (subscriptions.ts's PLAN_CATALOG,
-- commerce.ts, commissions.ts, etc.) from this point on.

alter table video_pricing drop constraint if exists video_pricing_rent_price_currency_check;
alter table video_pricing add constraint video_pricing_rent_price_currency_check
  check (rent_price_currency = any (array['GBP','USD','EUR','LKR','AUD']));

alter table video_pricing drop constraint if exists video_pricing_buy_price_currency_check;
alter table video_pricing add constraint video_pricing_buy_price_currency_check
  check (buy_price_currency = any (array['GBP','USD','EUR','LKR','AUD']));

alter table video_pricing drop constraint if exists video_pricing_ppv_price_currency_check;
alter table video_pricing add constraint video_pricing_ppv_price_currency_check
  check (ppv_price_currency = any (array['GBP','USD','EUR','LKR','AUD']));

alter table channel_membership_tiers alter column currency set default 'AUD';
alter table campaigns alter column currency set default 'AUD';
