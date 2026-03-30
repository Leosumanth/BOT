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
