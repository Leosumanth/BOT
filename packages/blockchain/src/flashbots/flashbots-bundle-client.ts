import { Wallet, id, getBytes } from "ethers";
import { keccak256 } from "viem";
import type { FlashbotsSimulationResult } from "@mintbot/shared";

interface BundleRequestBody {
  jsonrpc: "2.0";
  id: number;
  method: "eth_sendBundle" | "eth_callBundle";
  params: unknown[];
}

export class FlashbotsBundleClient {
  private readonly authSigner: Wallet;

  constructor(
    private readonly relayUrl: string,
    authPrivateKey: string
  ) {
    this.authSigner = new Wallet(authPrivateKey);
  }

  async simulate(signedTransactions: `0x${string}`[], blockNumberHex: `0x${string}`): Promise<FlashbotsSimulationResult> {
    const body: BundleRequestBody = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "eth_callBundle",
      params: [
        {
          txs: signedTransactions,
          blockNumber: blockNumberHex,
          stateBlockNumber: "latest"
        }
      ]
    };

    const result = await this.request(body);
    return {
      success: !result.error,
      bundleHash: result.result?.bundleHash,
      coinbaseDiff: result.result?.coinbaseDiff,
      gasUsed: result.result?.results?.[0]?.gasUsed,
      error: result.error?.message
    };
  }

  async sendBundle(signedTransactions: `0x${string}`[], blockNumberHex: `0x${string}`): Promise<{ bundleHash?: string; txHashes: `0x${string}`[] }> {
    const body: BundleRequestBody = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "eth_sendBundle",
      params: [
        {
          txs: signedTransactions,
          blockNumber: blockNumberHex,
          minTimestamp: 0,
          maxTimestamp: 0,
          revertingTxHashes: []
        }
      ]
    };

    const result = await this.request(body);
    if (result.error) {
      throw new Error(`Flashbots bundle rejected: ${result.error.message}`);
    }

    return {
      bundleHash: result.result?.bundleHash,
      txHashes: signedTransactions.map((transaction) => keccak256(transaction))
    };
  }

  private async request(body: BundleRequestBody): Promise<any> {
    const payload = JSON.stringify(body);
    const digest = id(payload);
    const signature = await this.authSigner.signMessage(getBytes(digest));

    const response = await fetch(this.relayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flashbots-signature": `${this.authSigner.address}:${signature}`
      },
      body: payload
    });

    if (!response.ok) {
      throw new Error(`Flashbots relay returned ${response.status}`);
    }

    return response.json();
  }
}
