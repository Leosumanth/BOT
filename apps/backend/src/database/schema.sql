create table if not exists wallets (
  id text primary key,
  label text not null,
  address text not null unique,
  encrypted_private_key text not null,
  chain text not null,
  enabled boolean not null default true,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists idx_logs_created_at on logs(created_at desc);
create index if not exists idx_transactions_job_id on transactions(job_id);
create index if not exists idx_mints_wallet_id on mints(wallet_id);
