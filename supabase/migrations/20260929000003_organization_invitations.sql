-- Business Team Member Invitations (Business Tier: "Employee access up to 5")

create table if not exists organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'editor', -- 'owner', 'editor', 'analyst'
  token text not null unique,
  status text not null default 'pending', -- 'pending', 'accepted', 'revoked'
  invited_by uuid references accounts(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create index if not exists org_invitations_org_idx
  on organization_invitations(organization_id, status);

create index if not exists org_invitations_token_idx
  on organization_invitations(token);
