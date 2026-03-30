use crate::config::WorkerConfig;
use crate::executor::execute_job;
use crate::models::{MintExecutionJob, MintExecutionResult};
use anyhow::{Context, Result};
use redis::aio::MultiplexedConnection;

pub struct RedisWorker {
    config: WorkerConfig,
    consumer: MultiplexedConnection,
    publisher: MultiplexedConnection,
}

impl RedisWorker {
    pub async fn new(config: WorkerConfig) -> Result<Self> {
        let client = config.redis_client()?;
        let consumer = client
            .get_multiplexed_async_connection()
            .await
            .context("failed to open Redis consumer connection")?;
        let publisher = client
            .get_multiplexed_async_connection()
            .await
            .context("failed to open Redis publisher connection")?;

        Ok(Self {
            config,
            consumer,
            publisher,
        })
    }

    pub async fn run_once(&mut self) -> Result<()> {
        let payload = self.pop_job().await?;
        let Some(payload) = payload else {
            return Ok(());
        };

        self.handle_job(payload).await
    }

    async fn pop_job(&mut self) -> Result<Option<String>> {
        let reply: Option<(String, String)> = redis::cmd("BRPOP")
            .arg(&self.config.queue_name)
            .arg(5)
            .query_async(&mut self.consumer)
            .await
            .context("Redis BRPOP failed")?;

        Ok(reply.map(|(_, payload)| payload))
    }

    async fn handle_job(&mut self, payload: String) -> Result<()> {
        let parsed_value: serde_json::Value =
            serde_json::from_str(&payload).context("failed to parse raw Redis payload as JSON")?;
        let job_id = parsed_value
            .get("jobId")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown")
            .to_string();

        let job: MintExecutionJob = match serde_json::from_value(parsed_value) {
            Ok(job) => job,
            Err(error) => {
                let result = MintExecutionResult::failed(job_id, format!("invalid job payload: {error}"));
                self.publish_result(&result).await?;
                return Ok(());
            }
        };

        let result = match execute_job(&self.config, &job).await {
            Ok(result) => {
                tracing::info!(job_id = %job.job_id, wallet_id = ?job.wallet_id, tx_hash = ?result.tx_hash, route = ?result.route, "transaction submitted");
                result
            }
            Err(error) => {
                tracing::error!(job_id = %job.job_id, wallet_id = ?job.wallet_id, error = ?error, "transaction execution failed");
                MintExecutionResult::failed(job.job_id.clone(), error.to_string())
            }
        };

        self.publish_result(&result).await
    }

    async fn publish_result(&mut self, result: &MintExecutionResult) -> Result<()> {
        let payload = serde_json::to_string(result).context("failed to serialize execution result")?;
        let _: i64 = redis::cmd("PUBLISH")
            .arg(&self.config.result_channel)
            .arg(payload)
            .query_async(&mut self.publisher)
            .await
            .context("failed to publish execution result")?;

        Ok(())
    }
}
