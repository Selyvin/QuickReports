-- Stores the QuickBooks OAuth tokens for each authenticated user.
-- One row per user (a user can only connect one QB company at a time).
create table public.qb_connections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  realm_id        text not null,                  -- QB company ID
  access_token    text not null,                  -- expires in 1 hour
  refresh_token   text not null,                  -- expires in 100 days
  token_expires_at timestamptz not null,
  company_name    text,                           -- populated lazily from QB API
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint qb_connections_user_id_key unique (user_id)
);

alter table public.qb_connections enable row level security;

-- Users can only see and manage their own connection.
create policy "owner access" on public.qb_connections
  for all using (auth.uid() = user_id);

-- Temporary CSRF state tokens created during the OAuth redirect.
-- Deleted immediately after use (or expire after 10 minutes).
create table public.qb_oauth_states (
  id         uuid primary key default gen_random_uuid(),  -- used as the `state` param
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.qb_oauth_states enable row level security;

-- Only the service role (edge functions) should touch this table.
-- No user-facing policies needed.

-- Auto-update updated_at on qb_connections
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger qb_connections_updated_at
  before update on public.qb_connections
  for each row execute function public.set_updated_at();
