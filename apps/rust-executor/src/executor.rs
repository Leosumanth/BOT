use crate::config::WorkerConfig;
use crate::models::{MintExecutionJob, MintExecutionResult};
use anyhow::{anyhow, Context, Result};
use ethers::prelude::{Http, LocalWallet, Middleware, Provider, Signer};
use ethers::types::transaction::eip2718::TypedTransaction;
use ethers::types::{Address, BlockNumber, Bytes, Eip1559TransactionRequest, NameOrAddress, TxHash, U256, U64};
use ethers::utils::keccak256;
use ethers_flashbots::{BundleRequest, FlashbotsMiddleware};
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use url::Url;

pub async fn execute_job(config: &WorkerConfig, job: &MintExecutionJob) -> Result<MintExecutionResult> {
    let provider = Provider::<Http>::try_from(job.rpc_url.as_str())
        .with_context(|| format!("invalid RPC URL for {}", job.job_id))?
        .interval(Duration::from_millis(50));
    let provider = Arc::new(provider);

    let wallet = LocalWallet::from_str(job.wallet_private_key.trim())
        .with_context(|| format!("invalid private key for {}", job.job_id))?
        .with_chain_id(job.chain_id);

    if let Some(expected_address) = &job.wallet_address {
        let expected = Address::from_str(expected_address).context("invalid walletAddress supplied by TypeScript")?;
        if wallet.address() != expected {
            return Err(anyhow!("walletAddress does not match the signing private key"));
        }
    }

    if let Some(not_before_unix_ms) = job.not_before_unix_ms {
        let now_ms = current_time_ms();
        if not_before_unix_ms > now_ms {
            sleep(Duration::from_millis(not_before_unix_ms - now_ms)).await;
        }
    }

    let nonce = match job.nonce {
        Some(nonce) => U256::from(nonce),
        None => {
            provider
                .get_transaction_count(wallet.address(), Some(BlockNumber::Pending.into()))
                .await
                .context("failed to fetch pending nonce")?
        }
    };

    let tx = TypedTransaction::Eip1559(
        Eip1559TransactionRequest::new()
            .chain_id(job.chain_id)
            .to(NameOrAddress::Address(
                Address::from_str(&job.to).context("invalid destination address")?,
            ))
            .data(Bytes::from_str(&job.data).context("invalid calldata hex")?)
            .value(parse_u256(&job.value).context("invalid value")?)
            .gas(parse_u256(&job.gas.gas_limit).context("invalid gasLimit")?)
            .nonce(nonce)
            .max_fee_per_gas(parse_u256(&job.gas.max_fee_per_gas).context("invalid maxFeePerGas")?)
            .max_priority_fee_per_gas(
                parse_u256(&job.gas.max_priority_fee_per_gas).context("invalid maxPriorityFeePerGas")?,
            ),
    );

    let signature = wallet
        .sign_transaction(&tx)
        .await
        .context("failed to sign EIP-1559 transaction")?;
    let raw_tx = tx.rlp_signed(&signature);
    let tx_hash = TxHash::from(keccak256(raw_tx.as_ref()));

    if job.use_flashbots {
        let bundle_hash = submit_via_flashbots(
            config,
            provider.clone(),
            raw_tx.clone(),
            job.simulate_before_send.unwrap_or(false),
            job.target_block_number.as_deref(),
        )
        .await?;
        return Ok(MintExecutionResult::success(job.job_id.clone(), format!("{tx_hash:#x}"), "flashbots")
            .with_bundle_hash(bundle_hash));
    } else {
        let pending_tx = provider
            .send_raw_transaction(raw_tx.clone())
            .await
            .context("failed to send raw transaction over RPC")?;

        let provider_hash = pending_tx.tx_hash();
        if provider_hash != tx_hash {
            tracing::warn!(job_id = %job.job_id, signed_hash = ?tx_hash, provider_hash = ?provider_hash, "provider hash differed from local signed hash");
        }
    }

    Ok(MintExecutionResult::success(job.job_id.clone(), format!("{tx_hash:#x}"), "rpc"))
}

fn parse_u256(value: &str) -> Result<U256> {
    U256::from_dec_str(value).map_err(|error| anyhow!("failed to parse decimal U256 '{value}': {error}"))
}

async fn submit_via_flashbots(
    config: &WorkerConfig,
    provider: Arc<Provider<Http>>,
    raw_tx: Bytes,
    simulate_before_send: bool,
    target_block_number: Option<&str>,
) -> Result<String> {
    let auth_key = config
        .flashbots_auth_private_key
        .clone()
        .context("FLASHBOTS_AUTH_PRIVATE_KEY is required when useFlashbots=true")?;
    let auth_wallet = LocalWallet::from_str(auth_key.trim()).context("invalid Flashbots auth private key")?;
    let relay_url = Url::parse(&config.flashbots_relay_url).context("invalid Flashbots relay URL")?;

    let flashbots = FlashbotsMiddleware::new(provider.clone(), relay_url, auth_wallet);
    let target_block = if let Some(target) = target_block_number {
        U64::from(
            target
                .parse::<u64>()
                .context("invalid targetBlockNumber")?,
        )
    } else {
        provider.get_block_number().await.context("failed to fetch target block")? + 1u64
    };
    let bundle = BundleRequest::new().push_transaction(raw_tx).set_block(target_block);

    if simulate_before_send {
        flashbots
            .simulate_bundle(&bundle)
            .await
            .context("Flashbots simulation failed")?;
    }

    flashbots
        .send_bundle(&bundle)
        .await
        .context("Flashbots bundle submission failed")?;

    Ok(format!("bundle:{target_block:#x}"))
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
