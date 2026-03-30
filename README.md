<<<<<<< HEAD
# MintBot Rust Executor

Rust worker for the latency-critical execution path:

1. NestJS/BullMQ orchestrates the mint job.
2. TypeScript prepares calldata, gas, nonce, and RPC selection.
3. TypeScript pushes a `RustMintExecutionRequest` into Redis.
4. This worker consumes the Redis queue, signs the EIP-1559 transaction, submits it to RPC or Flashbots, and publishes a result.
5. NestJS receives the result, updates PostgreSQL, and emits Socket.IO events.

## Run

```bash
cargo run --manifest-path apps/rust-executor/Cargo.toml
```

## Environment

- `RUST_WORKER_REDIS_URL` or `REDIS_URL`
- `RUST_WORKER_QUEUE_NAME` or `RUST_MINT_QUEUE_NAME`
- `RUST_WORKER_RESULT_CHANNEL` or `RUST_RESULT_CHANNEL`
- `FLASHBOTS_RELAY_URL`
- `FLASHBOTS_AUTH_PRIVATE_KEY`

## Notes

- Private keys are consumed only in-memory and are never logged.
- `jobId` should stay stable for a wallet execution attempt so TypeScript can dedupe and correlate results.
- Flashbots submission is supported when `useFlashbots=true` and the worker has relay credentials configured.
=======
# MintBot Monorepo

Production-oriented NFT mint bot and tracker system built as a TypeScript monorepo.

## Stack

- Backend: NestJS + PostgreSQL + Redis + BullMQ + Socket.IO
- Frontend: Next.js App Router + wagmi + Tailwind CSS + shadcn/ui-style components
- Blockchain: viem primary, ethers secondary
- Advanced routing: multi-RPC failover + Flashbots bundle support

## Workspace Layout

```text
apps/
  backend/   NestJS API, realtime gateway, BullMQ processors, tracker
  frontend/  Next.js dashboard home page
packages/
  shared/    shared types, queue names, socket events, helpers
  blockchain/ RPC router, gas strategy, contract analyzer, mempool listener, Flashbots
  bot/       mint execution engine, wallet concurrency, telemetry
```

## Core Capabilities

- Multi-wallet mint execution with nonce reservation
- EIP-1559 gas strategy and pre-signed transaction flow
- RPC rotation and failover across Alchemy + QuickNode
- Flashbots simulation and private bundle submission
- Contract analyzer with mint function, price, and supply heuristics
- Pending transaction tracking via websocket mempool listeners
- PostgreSQL persistence for wallets, contracts, transactions, mints, and logs
- BullMQ-backed mint queue
- Real-time dashboard updates over Socket.IO

## Environment

Copy `.env.example` to `.env` and provide:

- `DATABASE_URL`
- `REDIS_URL`
- `PRIVATE_KEY_ENCRYPTION_SECRET`
- `ADMIN_API_TOKEN`
- `DASHBOARD_ACCESS_PASSWORD`
- `DASHBOARD_SESSION_SECRET`
- at least one HTTP RPC and one WS RPC endpoint
- optional Flashbots auth key

## Development

```bash
npm install
npm run dev
```

Optional dedicated worker:

```bash
npm run dev:worker
```

## Local Workflow

Use localhost for fast fixes, then deploy to Railway once the whole flow is green.

1. Install Docker Desktop.
2. Start local PostgreSQL and Redis with `npm run local:infra:up`.
3. Copy `.env.example` to `.env`.
4. Keep these local defaults in `.env`:
   - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mintbot`
   - `REDIS_URL=redis://localhost:6379`
   - `FRONTEND_URL=http://localhost:3000`
5. Fill the required secrets in `.env`.
6. Run `npm run local:doctor` to check for missing local variables.
7. For fast iteration, run `npm run local:dev`.
8. In a second terminal, run `npm run local:verify`.
9. For Railway-like single-service testing, run `npm run local:prod`.
10. In a second terminal, run `npm run local:verify:prod`.

Expected local URLs:

- Dev mode frontend: `http://localhost:3000/login`
- Dev mode backend: `http://localhost:4000/health`
- Embedded production-like mode: `http://localhost:4000/login`
- Embedded production-like dashboard auth health: `http://localhost:4000/dashboard-api/health`

Helper commands:

- `npm run local:infra:up`
- `npm run local:infra:down`
- `npm run local:infra:logs`
- `npm run local:dev`
- `npm run local:prod`
- `npm run local:verify`
- `npm run local:verify:prod`

## Build

```bash
npm run build
```

## Railway

This repo is a shared npm-workspace monorepo. For Railway, keep each service rooted at the repository root so shared workspace packages stay available during builds.

### Option 1: Separate backend and frontend services

- Backend service config file: `/apps/backend/railway.json`
- Frontend service config file: `/apps/frontend/railway.json`

If your Railway services were created manually instead of via JavaScript monorepo auto-import, set each service's custom config file path to the matching absolute path above.

If you prefer configuring commands in the Railway dashboard instead of using the config files, use:

- Backend build command: `npm run build:backend`
- Backend start command: `npm run start:backend`
- Frontend build command: `npm run build:frontend`
- Frontend start command: `npm run start:frontend`

Set cross-service variables so the deployed frontend talks to the deployed backend and the backend CORS policy allows the frontend origin:

- Backend `FRONTEND_URL=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}`
- Backend `ADMIN_API_TOKEN=<shared long token>`
- Backend `REALTIME_AUTH_SECRET=<shared realtime secret>`
- Frontend `NEXT_PUBLIC_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}/api`
- Frontend `NEXT_PUBLIC_SOCKET_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}`
- Frontend `ADMIN_API_TOKEN=<same backend admin token, server-side only>`
- Frontend `REALTIME_AUTH_SECRET=<same realtime secret, server-side only>`
- Frontend `DASHBOARD_ACCESS_PASSWORD=<dashboard login password>`
- Frontend `DASHBOARD_SESSION_SECRET=<dashboard session secret>`

### Option 2: Single Railway service serving both frontend and backend

Deploy the repository root and let Railway use `/railway.json`. That build runs the full monorepo build, starts the backend, and the backend will serve the built Next.js frontend for all non-API routes.

- Root service config file: `/railway.json`
- Keep `FRONTEND_URL` unset or on its localhost default so the backend does not redirect away from itself
- Leave `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` unset in Railway so the frontend uses the same origin for its authenticated `/dashboard-api/*` proxy routes and Socket.IO
- Still set `ADMIN_API_TOKEN`, `REALTIME_AUTH_SECRET`, `DASHBOARD_ACCESS_PASSWORD`, and `DASHBOARD_SESSION_SECRET`

## API Surface

- `POST /api/bot/start`
- `POST /api/bot/stop`
- `GET /api/wallets`
- `POST /api/wallets`
- `GET /api/contracts`
- `POST /api/contracts/analyze`
- `GET /api/analytics/dashboard`
- `GET /api/analytics/summary`

## Realtime Events

- `dashboard:snapshot`
- `dashboard:telemetry`
- `mint:feed`
- `wallet:metrics`
- `job:status`

## Security Notes

- Backend API routes require the admin bearer token in `ADMIN_API_TOKEN`
- Realtime Socket.IO connections require a short-lived signed token derived from `REALTIME_AUTH_SECRET`
- Frontend pages are protected by a dashboard password and an HTTP-only session cookie
- Browser API calls are proxied through authenticated Next.js route handlers under `/dashboard-api/*` so wallet secrets and backend admin credentials stay server-side
>>>>>>> 67a447c10fc3fe55a5f452e92a7ac53ae87beaf0
