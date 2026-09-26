-- Two real fields the previous business_leads/product_links migration (20260930000010)
-- left out: a lead's phone number (the public "Get a quote" form only ever asked for
-- name/email/company/message) and a product link's image (the "Shop this video" card
-- has never shown a product photo, only its name and price). Also adds business_leads.
-- updated_at so a status change (new -> contacted -> qualified -> closed) has a real
-- timestamp, not just created_at.
alter table business_leads add column if not exists phone text;
alter table business_leads add column if not exists updated_at timestamptz not null default now();
alter table product_links add column if not exists image_url text;
