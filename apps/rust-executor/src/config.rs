use anyhow::{Context, Result};
use std::env;

#[derive(Debug, Clone)]
pub struct WorkerConfig {
    pub redis_url: String,
    pub queue_name: String,
    pub result_channel: String,
    pub flashbots_relay_url: String,
    pub flashbots_auth_private_key: Option<String>,
}

impl WorkerConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            redis_url: env_or("RUST_WORKER_REDIS_URL", "REDIS_URL")
                .unwrap_or_else(|| "redis://127.0.0.1:6379".to_string()),
            queue_name: env_or("RUST_WORKER_QUEUE_NAME", "RUST_MINT_QUEUE_NAME")
                .unwrap_or_else(|| "rust:mint".to_string()),
            result_channel: env_or("RUST_WORKER_RESULT_CHANNEL", "RUST_RESULT_CHANNEL")
                .unwrap_or_else(|| "rust:mint:results".to_string()),
            flashbots_relay_url: env::var("FLASHBOTS_RELAY_URL")
                .unwrap_or_else(|_| "https://relay.flashbots.net".to_string()),
            flashbots_auth_private_key: env::var("FLASHBOTS_AUTH_PRIVATE_KEY").ok(),
        })
    }

    pub fn redis_client(&self) -> Result<redis::Client> {
        redis::Client::open(self.redis_url.clone()).context("failed to create Redis client")
    }
}

fn env_or(primary: &str, fallback: &str) -> Option<String> {
    env::var(primary).ok().or_else(|| env::var(fallback).ok())
}
