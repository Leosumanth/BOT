# NFT Minting Bot

This project is a configurable EVM NFT minting bot built with `ethers`.

It is designed as a reusable template for contracts that expose a mint function such as:

- `mint()`
- `mint(uint256 quantity)`
- `publicSaleMint(uint256 quantity, bytes32[] proof)`
- other custom functions, as long as you provide the correct ABI and arguments

## What it does

- connects to an EVM RPC endpoint
- signs transactions with one or many wallet private keys
- optionally waits until a specific ISO timestamp before sending
- supports multiple RPC URLs for failover
- warms up the provider session before launch
- can pre-sign mint transactions before the launch gate and broadcast the raw payload instantly
- supports dynamic gas strategy presets that auto-adjust to live network conditions
- optionally simulates the mint transaction before sending
- supports dry-run mode for preflight checks
- retries transient mint failures intelligently with a configurable delay
- can keep retrying failed mint attempts inside a retry window until one succeeds
- can run wallets sequentially or in parallel
- can poll a contract read function until mint is ready
- can export run results to a JSON file
- calls your chosen mint function with custom JSON arguments
- optionally waits for the transaction receipt
- can automatically replace timed-out transactions with higher gas using the same nonce
- can submit transactions through a configurable private relay with optional public RPC fallback
- can broadcast the same signed transaction to multiple RPCs in parallel for faster public propagation
- can execute multiple tasks simultaneously without blocking the dashboard control plane
- can arm execution from on-chain events or pending mempool transactions
- can transfer freshly minted ERC-721 and ERC-1155 tokens to another wallet after confirmation
- can enqueue dashboard runs into Redis for dedicated worker execution
- includes a Postgres-backed dashboard with admin login
- auto-starts saved dashboard tasks when their scheduled launch time arrives
- encrypts dashboard-imported wallet secrets before storing them
- can send Telegram and Discord alerts for run lifecycle events
- can fetch verified contract ABI JSON from explorer APIs inside the dashboard
- can auto-detect `mint`, `publicMint`, and `safeMint` from ABI JSON to reduce task setup errors
- can auto-fill the mint function, args template, platform, quantity default, and detected ETH price after ABI upload or explorer fetch
- can auto-detect mint-start signals like `saleActive()`, `paused()`, `totalSupply()`, and contract state reads to fire as soon as mint opens
- can run in a fully automated mode from only `RPC_URL`, `PRIVATE_KEY`, `CONTRACT_ADDRESS`, and the contract ABI
- ranks likely public mint functions, auto-builds arguments, probes mint value, simulates before send, and falls back to alternate candidates automatically

## Setup

1. Install Node.js 18 or newer.
2. Install dependencies:

```bash
npm install
```

On Windows PowerShell, use:

```powershell
npm.cmd install
```

3. Copy the example env file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

4. Put your contract ABI into [abi/contract.json](C:/Users/hpome/Desktop/BOT/abi/contract.json).
5. Fill in your `.env` values.

## Environment variables

- `BOT_MODE`: optional startup override, use `bot` for the CLI minter or `dashboard` for the web UI
- `DATABASE_URL`: required for the dashboard, Postgres connection string
- `ENCRYPTION_KEY`: required for the dashboard, used to encrypt stored wallet secrets
- `ADMIN_USERNAME`: dashboard admin username, defaults to `admin`
- `ADMIN_PASSWORD`: dashboard admin password for startup bootstrap
- `ADMIN_PASSWORD_HASH`: optional pre-hashed admin password if you do not want a plain password in env
- `AUTH_REQUIRED`: set to `false` only if you intentionally want to disable dashboard auth
- `SESSION_TTL_HOURS`: dashboard session lifetime, defaults to `168`
- `COOKIE_SECURE`: optional cookie override, use `true` behind HTTPS or `false` for plain local HTTP
- `SCHEDULE_POLL_INTERVAL_MS`: how often the dashboard checks for due scheduled tasks, defaults to `1000`
- `DEFAULT_RPC_CHAIN_KEY`: chain key assigned to env-provided RPC nodes inside the dashboard, defaults to `base_sepolia`
- `QUEUE_MODE`: `local` or `redis`; set to `redis` to enqueue dashboard runs into Redis workers
- `REDIS_URL`: Redis connection string used by the queue producer and worker
- `REDIS_NAMESPACE`: queue key prefix, defaults to `mintbot`
- `REDIS_BLOCK_TIMEOUT_SEC`: blocking pop timeout used by the worker loop, defaults to `5`
- `WORKER_ID`: optional worker label that appears in distributed run state
- `WORKER_CONCURRENCY`: number of queued tasks a Redis worker can execute in parallel, defaults to `4`
- `ETHERSCAN_API_KEY`: optional fallback explorer API key used for dashboard ABI fetches
- `RPC_URL`: a single JSON-RPC endpoint
- `RPC_URLS`: optional comma-separated list of RPC endpoints for failover
- `PRIVATE_KEY`: a single wallet private key
- `PRIVATE_KEYS`: optional comma-separated list of wallet private keys
- `CONTRACT_ADDRESS`: NFT contract address
- `ABI_PATH`: path to the ABI JSON file
- `AUTO_MINT_MODE`: defaults to `true`; the bot analyzes the ABI, selects the best candidate mint function, builds arguments, discovers price, and simulates before broadcast
- `MINT_FUNCTION`: optional hint or manual override for the function to call
- `MINT_ARGS`: optional JSON array hint or manual override
  String values can include `{{wallet}}`, `{{index}}`, and `{{timestamp}}` placeholders.
- `MINT_VALUE_ETH`: optional ETH value hint or manual override
- `GAS_LIMIT`: optional gas limit
- `MAX_FEE_GWEI`: optional EIP-1559 max fee
- `MAX_PRIORITY_FEE_GWEI`: optional EIP-1559 priority fee
- `GAS_STRATEGY`: `aggressive`, `normal`, or `custom`
- `GAS_BOOST_PERCENT`: extra max fee boost percentage added on top of the selected strategy profile
- `PRIORITY_BOOST_PERCENT`: extra priority fee boost percentage added on top of the selected strategy profile
- `WAIT_UNTIL_ISO`: optional start time such as `2026-03-21T18:30:00Z`
- `POLL_INTERVAL_MS`: how often to check the countdown
- `MULTI_RPC_BROADCAST`: broadcast the same signed transaction to every configured public RPC in parallel; the first accepted response wins and the rest improve propagation
- `WAIT_FOR_RECEIPT`: `true` or `false`
- `SIMULATE_TRANSACTION`: run `staticCall` and gas estimation before sending
- `DRY_RUN`: validate everything without broadcasting a transaction
- `MAX_RETRIES`: number of send attempts per wallet
- `RETRY_DELAY_MS`: wait time between retries
- `RETRY_WINDOW_MS`: optional retry window in milliseconds; the bot keeps retrying inside this window even after `MAX_RETRIES` is exhausted
- `WALLET_MODE`: `parallel` or `sequential`, defaults to `parallel`
- `CHAIN_ID`: optional expected chain ID safety check
- `RECEIPT_CONFIRMATIONS`: number of confirmations to wait for
- `TX_TIMEOUT_MS`: optional receipt wait timeout
- `SMART_GAS_REPLACEMENT`: automatically reprice a timed-out transaction using the same nonce
- `REPLACEMENT_BUMP_PERCENT`: fee bump applied to each replacement transaction
- `REPLACEMENT_MAX_ATTEMPTS`: maximum number of replacement broadcasts after the initial send
- `PRIVATE_RELAY_ENABLED`: submit signed transactions to a relay endpoint instead of the public RPC
- `PRIVATE_RELAY_URL`: relay JSON-RPC endpoint used when `PRIVATE_RELAY_ENABLED=true`
- `PRIVATE_RELAY_METHOD`: `eth_sendRawTransaction` or `eth_sendPrivateTransaction`
- `PRIVATE_RELAY_HEADERS_JSON`: optional JSON object of relay HTTP headers, for example auth headers
- `PRIVATE_RELAY_ONLY`: fail the run instead of falling back to the public RPC when relay submission fails
- `START_JITTER_MS`: random startup delay per wallet, useful in parallel mode
- `NONCE_OFFSET`: optional nonce offset if you deliberately want to skip ahead
- `MINT_START_DETECTION_ENABLED`: defaults to `true`; poll auto-detected sale-open signals like `saleActive()`, `isPublicSaleOpen()`, or `publicMintActive()` before broadcasting
- `MINT_START_DETECTION_JSON`: optional JSON object describing sale-open detectors. `saleActiveFunction` and `stateFunction` are primary open signals; `pausedFunction` and `totalSupplyFunction` are supplemental context checks
- `READY_CHECK_FUNCTION`: optional read function to poll before minting
- `READY_CHECK_ARGS`: JSON array for the ready-check function
- `READY_CHECK_EXPECTED`: JSON value used when `READY_CHECK_MODE=equals`
- `READY_CHECK_MODE`: `truthy`, `falsey`, or `equals`
- `READY_CHECK_INTERVAL_MS`: how often to poll the ready check
- `EXECUTION_TRIGGER_MODE`: `standard`, `event`, or `mempool`
- `TRIGGER_CONTRACT_ADDRESS`: optional trigger contract override, defaults to `CONTRACT_ADDRESS`
- `TRIGGER_EVENT_SIGNATURE`: event fragment used when `EXECUTION_TRIGGER_MODE=event`
- `TRIGGER_EVENT_CONDITION`: optional JSON subset match against decoded event args
- `TRIGGER_MEMPOOL_SIGNATURE`: optional function signature or `0x` selector filter for pending tx matches
- `TRIGGER_TIMEOUT_MS`: optional timeout for event or mempool arming
- `WARMUP_RPC`: preload provider state before launch
- `CONTINUE_ON_ERROR`: continue sequential runs after a wallet fails
- `RESULTS_PATH`: optional JSON output path for a summary file
- `MIN_BALANCE_ETH`: optional minimum wallet balance guard
- `TRANSFER_AFTER_MINTED`: after a confirmed mint, transfer detected ERC-721 or ERC-1155 mints away from the sender wallet
- `TRANSFER_ADDRESS`: destination wallet used when `TRANSFER_AFTER_MINTED=true`
- `HOST`: optional web dashboard bind host, defaults to `127.0.0.1` locally and `0.0.0.0` when `PORT` is set
- `PORT`: optional web dashboard port, defaults to `3000`

## Examples

Minimal fully automated setup:

```env
RPC_URL=https://rpc.example
PRIVATE_KEY=0xyourprivatekey
CONTRACT_ADDRESS=0xYourContract
ABI_PATH=./abi/contract.json
AUTO_MINT_MODE=true
```

Provide manual hints while keeping automation enabled:

```env
AUTO_MINT_MODE=true
MINT_FUNCTION=publicMint
MINT_ARGS=[1]
MINT_VALUE_ETH=0.05
```

Disable automation and run a fully manual call:

```env
AUTO_MINT_MODE=false
MINT_FUNCTION=publicSaleMint
MINT_ARGS=[1,["0xabc...","0xdef..."]]
MINT_VALUE_ETH=0.03
```

Run three wallets in parallel with retry support:

```env
PRIVATE_KEYS=0xabc...,0xdef...,0x123...
RPC_URLS=https://rpc1.example,https://rpc2.example
WALLET_MODE=parallel
MAX_RETRIES=3
RETRY_DELAY_MS=1500
SIMULATE_TRANSACTION=true
START_JITTER_MS=250
```

Retry failed mints for up to 30 minutes:

```env
MAX_RETRIES=1
RETRY_DELAY_MS=1500
RETRY_WINDOW_MS=1800000
```

Manual mode keeps pre-signing enabled. For a scheduled mint, the bot builds and signs before the launch gate and only broadcasts the raw payload at launch:

```env
WAIT_UNTIL_ISO=2026-03-21T18:30:00Z
GAS_LIMIT=200000
```

If the contract cannot be gas-estimated before the sale opens, set `GAS_LIMIT` manually so the bot can sign ahead of time in manual mode. Automated mode skips pre-signing and resolves the transaction just-in-time after its preflight checks.

Wait until a sale flag becomes live:

```env
READY_CHECK_FUNCTION=isPublicSaleOpen
READY_CHECK_ARGS=[]
READY_CHECK_MODE=truthy
READY_CHECK_INTERVAL_MS=500
```

Auto-detect mint start from common contract state reads instead of relying only on time:

```env
MINT_START_DETECTION_ENABLED=true
MINT_START_DETECTION_JSON={"saleActiveFunction":"saleActive","totalSupplyFunction":"totalSupply","stateFunction":"saleState","pollIntervalMs":500}
```

Use the normal dynamic gas profile with a small extra fee boost:

```env
GAS_STRATEGY=normal
GAS_BOOST_PERCENT=15
PRIORITY_BOOST_PERCENT=20
```

Use the aggressive dynamic gas profile for hotter launches:

```env
GAS_STRATEGY=aggressive
```

Use fully custom fee caps:

```env
GAS_STRATEGY=custom
MAX_FEE_GWEI=40
MAX_PRIORITY_FEE_GWEI=4
```

Enable timeout-based gas replacement and move minted tokens to a vault wallet:

```env
WAIT_FOR_RECEIPT=true
TX_TIMEOUT_MS=45000
SMART_GAS_REPLACEMENT=true
REPLACEMENT_BUMP_PERCENT=12
REPLACEMENT_MAX_ATTEMPTS=2
TRANSFER_AFTER_MINTED=true
TRANSFER_ADDRESS=0xYourVaultAddress
```

Arm execution from an event and only mint after it fires:

```env
EXECUTION_TRIGGER_MODE=event
TRIGGER_CONTRACT_ADDRESS=0xSaleContract
TRIGGER_EVENT_SIGNATURE=SaleStateChanged(bool isOpen)
TRIGGER_EVENT_CONDITION={"isOpen":true}
TRIGGER_TIMEOUT_MS=120000
```

Arm execution from the mempool when a matching function call appears:

```env
RPC_URLS=wss://mainnet.example,https://mainnet-backup.example
EXECUTION_TRIGGER_MODE=mempool
TRIGGER_CONTRACT_ADDRESS=0xSaleContract
TRIGGER_MEMPOOL_SIGNATURE=setPublicSaleOpen(bool)
TRIGGER_TIMEOUT_MS=60000
```

Use a private relay and only fall back to the public RPC if relay submission fails:

```env
PRIVATE_RELAY_ENABLED=true
PRIVATE_RELAY_URL=https://relay.example/rpc
PRIVATE_RELAY_METHOD=eth_sendRawTransaction
PRIVATE_RELAY_HEADERS_JSON={"Authorization":"Bearer your-token"}
PRIVATE_RELAY_ONLY=false
```

Broadcast the same signed transaction to multiple RPCs for faster propagation:

```env
RPC_URLS=https://rpc1.example,https://rpc2.example,wss://rpc3.example
MULTI_RPC_BROADCAST=true
```

This does not create extra on-chain cost because every endpoint receives the same signed payload and therefore the same tx hash.

Enable Redis queue mode with a dedicated worker:

```env
QUEUE_MODE=redis
REDIS_URL=redis://127.0.0.1:6379
REDIS_NAMESPACE=mintbot
```

## Run

CLI:

```bash
npm run bot
```

On Windows PowerShell:

```powershell
npm.cmd run bot
```

Web dashboard:

```bash
npm run ui
```

On Windows PowerShell:

```powershell
npm.cmd run ui
```

Queue worker:

```bash
npm run worker
```

On Windows PowerShell:

```powershell
npm.cmd run worker
```

The dashboard now requires:

- `DATABASE_URL`
- `ENCRYPTION_KEY`
- `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`

Then open `http://127.0.0.1:3000` and sign in with the configured admin account.

Default startup:

```bash
npm start
```

`npm start` now chooses a mode automatically:

- it starts the CLI bot when the required bot env vars are present
- it starts the dashboard on hosted platforms that provide `PORT` but do not have a complete bot configuration

Set `BOT_MODE=bot` or `BOT_MODE=dashboard` if you want to force one mode explicitly.
Set `BOT_MODE=worker` if you want the process to boot directly into the Redis worker.

The dashboard now stores tasks, RPC nodes, sessions, and encrypted imported wallets in Postgres. Env-provided wallets and RPC URLs still load at runtime without being copied into the database.
Explorer keys and alert credentials can be supplied from `.env` or saved from the dashboard settings view. Dashboard-saved credentials are encrypted server-side and only their configured status is exposed back to the browser.
When `QUEUE_MODE=redis`, the dashboard enqueues task launches into Redis and a separate worker process consumes them, publishes live log events, and writes runtime/history records back into Postgres.
The local dashboard can now run multiple tasks simultaneously, and Redis workers can process multiple queued tasks at the same time when `WORKER_CONCURRENCY` is greater than `1`.
When a dashboard task has schedule enabled, the dashboard process polls for due tasks and auto-starts them. Keep the dashboard server online for scheduled launches, and keep the worker online too when `QUEUE_MODE=redis`.

## Mint Requirements

To mint successfully you typically need all of the following:

- one or more funded EVM wallets with enough native gas token
- at least one healthy RPC endpoint for the target chain
- the NFT contract address
- the correct contract ABI
- optionally, manual hints for function, args, or price if you want to override the automated path
- the correct chain selection so the bot uses matching RPC nodes

API and service requirements:

- Required: JSON-RPC API for the chain you are minting on
- Required for the dashboard: Postgres database
- Optional: Redis if you want distributed queue workers
- Optional: Etherscan API key for one-click ABI fetches in the dashboard
- Optional: Telegram Bot API credentials for alerts
- Optional: Discord webhook URL for alerts
- Optional: private relay RPC if you want private transaction submission

## Important notes

- This bot assumes the target contract is on an EVM-compatible chain.
- The fully automated path only needs RPC, wallet, contract, and ABI, but it still depends on the ABI being correct and complete.
- Automated mint mode prioritizes inclusion speed over gas cost: it simulates every candidate, uses aggressive EIP-1559 fees, and bumps replacement transactions by default.
- The dashboard now auto-detects `mint`, `publicMint`, and `safeMint` from pasted, uploaded, or explorer-fetched ABIs and auto-fills the mint function when your current selection is not valid for that ABI.
- When a contract address, chain, and ABI are available in the dashboard, the task builder now auto-fills the mint function, mint args template, platform, and default quantity, and it tries to read the mint price from common on-chain view functions such as `mintPrice()` or `publicSalePrice()`.
- The dashboard also auto-detects mint-start signals from the ABI. When it finds strong indicators like `saleActive()`, `paused()`, or a sale state read, it arms mint-start detection automatically and uses `totalSupply()` as a supplemental signal when available.
- Test with a low-risk wallet first.
- Keep your private key secure and never commit `.env`.
