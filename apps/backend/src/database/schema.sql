create table if not exists wallets (
  id text primary key,
  label text not null,
  address text not null unique,
  address_short text not null,
  secret_ciphertext text not null,
  encrypted_private_key text not null,
  wallet_group text not null default 'Imported',
  status text not null default 'ready',
  source text not null default 'stored',
  chain text not null default 'ethereum',
  enabled boolean not null default true,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table wallets add column if not exists address_short text;
alter table wallets add column if not exists secret_ciphertext text;
alter table wallets add column if not exists encrypted_private_key text;
alter table wallets add column if not exists wallet_group text not null default 'Imported';
alter table wallets add column if not exists status text not null default 'ready';
alter table wallets add column if not exists source text not null default 'stored';
alter table wallets add column if not exists chain text not null default 'ethereum';
alter table wallets add column if not exists enabled boolean not null default true;
alter table wallets add column if not exists tags jsonb not null default '[]'::jsonb;

update wallets
set
  address_short = coalesce(nullif(address_short, ''), concat(left(address, 6), '...', right(address, 4))),
  encrypted_private_key = coalesce(encrypted_private_key, secret_ciphertext),
  secret_ciphertext = coalesce(secret_ciphertext, encrypted_private_key),
  chain = coalesce(nullif(chain, ''), 'ethereum'),
  enabled = coalesce(enabled, true),
  tags = coalesce(tags, '[]'::jsonb)
where
  address_short is null
  or address_short = ''
  or encrypted_private_key is null
  or secret_ciphertext is null
  or chain is null
  or chain = ''
  or enabled is null
  or tags is null;

alter table wallets alter column address_short set not null;
alter table wallets alter column secret_ciphertext set not null;
alter table wallets alter column encrypted_private_key set not null;
alter table wallets alter column chain set not null;
alter table wallets alter column enabled set not null;
alter table wallets alter column tags set not null;

create table if not exists contracts (
  address text not null,
  chain text not null,
  mint_function jsonb,
  price_wei numeric,
  max_supply numeric,
  max_per_wallet numeric,
  abi_fragments jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  scanned_at timestamptz not null default now(),
  primary key (address, chain)
);

create table if not exists jobs (
  id text primary key,
  status text not null,
  chain text not null,
  contract_address text not null,
  mint_function text,
  quantity integer not null,
  value_wei numeric,
  wallet_ids jsonb not null default '[]'::jsonb,
  gas_strategy text not null,
  use_flashbots boolean not null default false,
  simulate_first boolean not null default true,
  source text not null default 'manual',
  last_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stopped_at timestamptz,
  deleted_at timestamptz
);

create table if not exists transactions (
  id text primary key,
  job_id text not null,
  wallet_id text not null references wallets(id) on delete cascade,
  chain text not null,
  contract_address text not null,
  tx_hash text,
  status text not null,
  nonce integer,
  rpc_key text,
  flashbots_bundle_hash text,
  error_message text,
  submitted_at timestamptz not null,
  confirmed_at timestamptz
);

create table if not exists mints (
  id text primary key,
  job_id text not null,
  wallet_id text not null references wallets(id) on delete cascade,
  contract_address text not null,
  chain text not null,
  quantity integer not null,
  value_wei numeric not null default 0,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logs (
  id text primary key,
  job_id text,
  level text not null,
  event_type text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists rpc_endpoints (
  key text primary key,
  label text not null,
  chain text not null,
  transport text not null,
  provider text not null,
  url text not null,
  priority integer not null default 10,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_credentials (
  key text primary key,
  value_ciphertext text,
  value_hint text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table api_credentials add column if not exists value_ciphertext text;
alter table api_credentials add column if not exists value_hint text not null default '';
alter table api_credentials add column if not exists enabled boolean not null default true;

create table if not exists api_service_configs (
  id text primary key,
  provider text not null,
  label text not null,
  value_ciphertext text,
  endpoint_url text not null,
  enabled boolean not null default true,
  priority integer not null default 10,
  is_backup boolean not null default false,
  auto_failover boolean not null default true,
  automation_enabled boolean not null default true,
  max_latency_ms integer not null default 2500,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_service_state (
  config_ref text primary key,
  provider text not null,
  status text not null default 'offline',
  active boolean not null default false,
  failover_active boolean not null default false,
  reachable boolean not null default false,
  auth_valid boolean not null default false,
  last_latency_ms integer,
  last_checked_at timestamptz,
  last_successful_at timestamptz,
  last_failure_at timestamptz,
  failure_reason text,
  error_type text,
  raw_error_message text,
  last_known_stable_at timestamptz,
  last_known_stable_state text,
  observed_success_count integer not null default 0,
  observed_failure_count integer not null default 0,
  timeout_count integer not null default 0,
  auth_failure_count integer not null default 0,
  rate_limit_count integer not null default 0,
  network_error_count integer not null default 0,
  invalid_response_count integer not null default 0,
  server_error_count integer not null default 0,
  unknown_error_count integer not null default 0,
  failover_count integer not null default 0,
  recovery_success_count integer not null default 0,
  latency_history_ms jsonb not null default '[]'::jsonb,
  rate_limit_snapshot jsonb not null default '{}'::jsonb,
  selection_score numeric not null default 0,
  selection_reasons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists api_service_logs (
  id text primary key,
  config_ref text,
  provider text not null,
  api_name text not null,
  event_type text not null,
  error_type text,
  action_taken text not null,
  result text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists api_service_maintenance_runs (
  id text primary key,
  trigger text not null,
  status text not null,
  summary text not null default '',
  checked_configs integer not null default 0,
  healthy_configs integer not null default 0,
  failovers_activated integer not null default 0,
  warnings integer not null default 0,
  started_at timestamptz not null,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_logs_created_at on logs(created_at desc);
create index if not exists idx_jobs_created_at on jobs(created_at desc);
create index if not exists idx_transactions_job_id on transactions(job_id);
create index if not exists idx_mints_wallet_id on mints(wallet_id);
create index if not exists idx_rpc_endpoints_chain on rpc_endpoints(chain, transport, priority);
create index if not exists idx_api_service_configs_provider on api_service_configs(provider, priority, created_at);
create index if not exists idx_api_service_logs_created_at on api_service_logs(created_at desc);
create index if not exists idx_api_service_maintenance_runs_started_at on api_service_maintenance_runs(started_at desc);
