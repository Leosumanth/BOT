mod config;
mod executor;
mod models;
mod redis_bridge;

use crate::config::WorkerConfig;
use crate::redis_bridge::RedisWorker;
use anyhow::Result;
use std::time::Duration;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("mintbot_rust_executor=info".parse()?))
        .with_target(false)
        .compact()
        .init();

    let config = WorkerConfig::from_env()?;
    tracing::info!(queue = %config.queue_name, results = %config.result_channel, "starting Rust mint executor worker");

    let mut worker = RedisWorker::new(config).await?;

    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                tracing::info!("shutdown signal received");
                break;
            }
            result = worker.run_once() => {
                if let Err(error) = result {
                    tracing::error!(error = ?error, "worker iteration failed");
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    }

    Ok(())
}
