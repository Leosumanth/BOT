use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MintExecutionGasConfig {
    pub max_fee_per_gas: String,
    pub max_priority_fee_per_gas: String,
    pub gas_limit: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MintExecutionJob {
    pub job_id: String,
    pub wallet_private_key: String,
    pub to: String,
    pub data: String,
    pub value: String,
    pub chain_id: u64,
    pub rpc_url: String,
    pub gas: MintExecutionGasConfig,
    #[serde(default)]
    pub use_flashbots: bool,
    #[serde(default)]
    pub nonce: Option<u64>,
    #[serde(default)]
    pub simulate_before_send: Option<bool>,
    #[serde(default)]
    pub wallet_address: Option<String>,
    #[serde(default)]
    pub wallet_id: Option<String>,
    #[serde(default)]
    pub mint_job_id: Option<String>,
    #[serde(default)]
    pub rpc_key: Option<String>,
    #[serde(default)]
    pub target_block_number: Option<String>,
    #[serde(default)]
    pub not_before_unix_ms: Option<u64>,
    #[serde(default)]
    pub submission_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MintExecutionResult {
    pub job_id: String,
    pub status: String,
    pub tx_hash: Option<String>,
    pub bundle_hash: Option<String>,
    pub route: Option<String>,
    pub submitted_at_unix_ms: Option<u64>,
    pub error: Option<String>,
}

impl MintExecutionResult {
    pub fn success(job_id: impl Into<String>, tx_hash: impl Into<String>, route: impl Into<String>) -> Self {
        Self {
            job_id: job_id.into(),
            status: "success".to_string(),
            tx_hash: Some(tx_hash.into()),
            bundle_hash: None,
            route: Some(route.into()),
            submitted_at_unix_ms: Some(current_time_ms()),
            error: None,
        }
    }

    pub fn failed(job_id: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            job_id: job_id.into(),
            status: "failed".to_string(),
            tx_hash: None,
            bundle_hash: None,
            route: None,
            submitted_at_unix_ms: Some(current_time_ms()),
            error: Some(error.into()),
        }
    }

    pub fn with_bundle_hash(mut self, bundle_hash: impl Into<String>) -> Self {
        self.bundle_hash = Some(bundle_hash.into());
        self
    }
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
