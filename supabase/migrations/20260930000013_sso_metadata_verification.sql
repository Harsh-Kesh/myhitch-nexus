-- SSO config previously accepted any string as the IdP metadata URL with zero real
-- validation. This doesn't make login federation work (that still needs a real SAML
-- identity-provider integration this app doesn't have — see saveSsoConfig()'s own
-- header), but it does make the one part that's genuinely checkable real: is this
-- actually a reachable URL serving real SAML metadata XML, not a typo or a placeholder.
alter table enterprise_sso_configs add column if not exists metadata_verified boolean not null default false;
alter table enterprise_sso_configs add column if not exists metadata_checked_at timestamptz;
