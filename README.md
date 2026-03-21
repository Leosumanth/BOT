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
- optionally simulates the mint transaction before sending
- supports dry-run mode for preflight checks
- retries failed mint attempts with a configurable delay
- can run wallets sequentially or in parallel
- can poll a contract read function until mint is ready
- can export run results to a JSON file
- calls your chosen mint function with custom JSON arguments
- optionally waits for the transaction receipt

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

- `RPC_URL`: a single JSON-RPC endpoint
- `RPC_URLS`: optional comma-separated list of RPC endpoints for failover
- `PRIVATE_KEY`: a single wallet private key
- `PRIVATE_KEYS`: optional comma-separated list of wallet private keys
- `CONTRACT_ADDRESS`: NFT contract address
- `ABI_PATH`: path to the ABI JSON file
- `MINT_FUNCTION`: function name to call
- `MINT_ARGS`: JSON array of arguments, for example `[]` or `[2]`
  String values can include `{{wallet}}`, `{{index}}`, and `{{timestamp}}` placeholders.
- `MINT_VALUE_ETH`: ETH value to send with the transaction
- `GAS_LIMIT`: optional gas limit
- `MAX_FEE_GWEI`: optional EIP-1559 max fee
- `MAX_PRIORITY_FEE_GWEI`: optional EIP-1559 priority fee
- `GAS_STRATEGY`: `manual` or `provider`
- `GAS_BOOST_PERCENT`: boost provider fee suggestions by a percentage
- `PRIORITY_BOOST_PERCENT`: boost provider priority fee suggestions by a percentage
- `WAIT_UNTIL_ISO`: optional start time such as `2026-03-21T18:30:00Z`
- `POLL_INTERVAL_MS`: how often to check the countdown
- `WAIT_FOR_RECEIPT`: `true` or `false`
- `SIMULATE_TRANSACTION`: run `staticCall` and gas estimation before sending
- `DRY_RUN`: validate everything without broadcasting a transaction
- `MAX_RETRIES`: number of send attempts per wallet
- `RETRY_DELAY_MS`: wait time between retries
- `WALLET_MODE`: `sequential` or `parallel`
- `CHAIN_ID`: optional expected chain ID safety check
- `RECEIPT_CONFIRMATIONS`: number of confirmations to wait for
- `TX_TIMEOUT_MS`: optional receipt wait timeout
- `START_JITTER_MS`: random startup delay per wallet, useful in parallel mode
- `NONCE_OFFSET`: optional nonce offset if you deliberately want to skip ahead
- `READY_CHECK_FUNCTION`: optional read function to poll before minting
- `READY_CHECK_ARGS`: JSON array for the ready-check function
- `READY_CHECK_EXPECTED`: JSON value used when `READY_CHECK_MODE=equals`
- `READY_CHECK_MODE`: `truthy`, `falsey`, or `equals`
- `READY_CHECK_INTERVAL_MS`: how often to poll the ready check
- `WARMUP_RPC`: preload provider state before launch
- `CONTINUE_ON_ERROR`: continue sequential runs after a wallet fails
- `RESULTS_PATH`: optional JSON output path for a summary file
- `MIN_BALANCE_ETH`: optional minimum wallet balance guard

## Examples

Mint one free NFT with `mint()`:

```env
MINT_FUNCTION=mint
MINT_ARGS=[]
MINT_VALUE_ETH=0
```

Mint 2 NFTs with `mint(uint256 quantity)`:

```env
MINT_FUNCTION=mint
MINT_ARGS=[2]
MINT_VALUE_ETH=0.08
```

Mint using an allowlist proof:

```env
MINT_FUNCTION=publicSaleMint
MINT_ARGS=[1,["0xabc...","0xdef..."]]
MINT_VALUE_ETH=0.03
```

Use a wallet placeholder inside arguments:

```env
MINT_FUNCTION=mintTo
MINT_ARGS=["{{wallet}}",1]
MINT_VALUE_ETH=0.02
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

Wait until a sale flag becomes live:

```env
READY_CHECK_FUNCTION=isPublicSaleOpen
READY_CHECK_ARGS=[]
READY_CHECK_MODE=truthy
READY_CHECK_INTERVAL_MS=500
```

Use provider gas suggestions with a fee boost:

```env
GAS_STRATEGY=provider
GAS_BOOST_PERCENT=15
PRIORITY_BOOST_PERCENT=20
```

## Run

CLI:

```bash
npm start
```

On Windows PowerShell:

```powershell
npm.cmd start
```

Web dashboard:

```bash
npm run ui
```

On Windows PowerShell:

```powershell
npm.cmd run ui
```

Then open `http://127.0.0.1:3000`.

The dashboard is local-only by default, lets you paste ABI JSON directly, start and stop runs, watch live logs, and review result JSON after the run finishes.

## Important notes

- This bot assumes the target contract is on an EVM-compatible chain.
- You must use the correct ABI and exact function arguments for the collection you want to mint.
- Test with a low-risk wallet first.
- Keep your private key secure and never commit `.env`.
