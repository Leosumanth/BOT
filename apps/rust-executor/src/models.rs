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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MintExecutionResult {
    pub job_id: String,
    pub status: String,
    pub tx_hash: Option<String>,
    pub error: Option<String>,
}

impl MintExecutionResult {
    pub fn success(job_id: impl Into<String>, tx_hash: impl Into<String>) -> Self {
        Self {
            job_id: job_id.into(),
            status: "success".to_string(),
            tx_hash: Some(tx_hash.into()),
            error: None,
        }
    }

    pub fn failed(job_id: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            job_id: job_id.into(),
            status: "failed".to_string(),
            tx_hash: None,
            error: Some(error.into()),
        }
    }
}
