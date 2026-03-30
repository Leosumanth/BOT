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
