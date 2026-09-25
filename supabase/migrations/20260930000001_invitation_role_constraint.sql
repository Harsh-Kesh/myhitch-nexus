-- Defense in depth (found during a full-platform audit, 2026-09-24): the app layer now
-- rejects any invite role other than 'editor'/'analyst' (never 'owner' — that would be a
-- privilege-escalation path via invitation acceptance), but the column itself had no
-- constraint enforcing this, only a comment. A real CHECK means a future write path can't
-- silently reopen the hole.
alter table organization_invitations
  add constraint organization_invitations_role_check
  check (role in ('editor', 'analyst'));
