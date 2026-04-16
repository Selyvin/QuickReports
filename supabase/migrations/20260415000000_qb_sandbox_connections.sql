-- Stores the shared QuickBooks sandbox OAuth tokens.
-- Separate from qb_connections so there is no foreign-key dependency on auth.users.
-- There is only ever one row in this table (the sandbox company).
create table public.qb_sandbox_connections (
  id               uuid primary key default gen_random_uuid(),
  realm_id         text not null,
  access_token     text not null,
  refresh_token    text not null,
  token_expires_at timestamptz not null,
  updated_at       timestamptz not null default now()
);

alter table public.qb_sandbox_connections enable row level security;

-- Only service-role (edge functions) may access this table.
-- No user-facing policies.

create trigger qb_sandbox_connections_updated_at
  before update on public.qb_sandbox_connections
  for each row execute function public.set_updated_at();
