-- Real audience breakdown (FR-6.9.2) — country/device/language captured at the existing
-- watch_progress heartbeat, from headers that are already present on every real request
-- for free: Cloudflare (this app's edge, confirmed in production response headers)
-- stamps `cf-ipcountry` on every proxied request, and `user-agent`/`accept-language` are
-- standard on any browser request. No new vendor, no new client instrumentation.
alter table watch_progress add column country text;
alter table watch_progress add column device_type text;
alter table watch_progress add column language text;
