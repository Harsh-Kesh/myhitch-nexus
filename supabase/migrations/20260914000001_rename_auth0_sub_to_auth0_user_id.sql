-- Aligns column naming with docs/AUTH0_INTEGRATION_STANDARD.md §3, which every MYHitch
-- platform integrating Auth0 follows: "one additive column: users.auth0_user_id text
-- unique". Table name stays `accounts` (Nexus's own convention — the standard doesn't
-- mandate a table name, only the identity-linking column name and its semantics).
alter table accounts rename column auth0_sub to auth0_user_id;
