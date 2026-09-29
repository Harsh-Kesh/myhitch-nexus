create table notifications (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references accounts(id) on delete cascade,
    event text not null,
    title text not null,
    body text not null,
    href text not null,
    read boolean not null default false,
    created_at timestamp with time zone not null default now()
);

create index notifications_account_id_idx on notifications(account_id);

alter table accounts
    add column notification_preferences jsonb not null default '{}'::jsonb,
    add column privacy_settings jsonb not null default '{}'::jsonb,
    add column parental_controls jsonb not null default '{}'::jsonb;

