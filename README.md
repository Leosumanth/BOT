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

## Build

```bash
npm run build
```

## Railway

This repo is a shared npm-workspace monorepo. For Railway, keep each service rooted at the repository root so shared workspace packages stay available during builds.

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
- Frontend `NEXT_PUBLIC_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}/api`
- Frontend `NEXT_PUBLIC_SOCKET_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}`

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
