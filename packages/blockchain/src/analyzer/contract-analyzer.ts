import { Interface } from "ethers";
import { parseAbi } from "viem";
import type { ChainKey, ContractAnalysisResult, MintFunctionCandidate } from "@mintbot/shared";
import { nowIso } from "@mintbot/shared";
import { MINT_FUNCTION_SIGNATURES, PRICE_FUNCTION_SIGNATURES, SUPPLY_FUNCTION_SIGNATURES, selectorFor } from "./abi-candidates.js";
import { RpcRouter } from "../clients/rpc-router.js";

export class ContractAnalyzer {
  constructor(private readonly rpcRouter: RpcRouter) {}

  async analyze(chain: ChainKey, contractAddress: `0x${string}`): Promise<ContractAnalysisResult> {
    const bytecode = await this.rpcRouter.executeWithFailover(chain, (runtime) =>
      runtime.publicClient.getBytecode({ address: contractAddress })
    );

    const code = bytecode ?? "0x";
    const mintCandidates = this.detectMintFunctions(code);

    const [priceWei, maxSupply, maxPerWallet] = await Promise.all([
      this.tryReadUint(chain, contractAddress, PRICE_FUNCTION_SIGNATURES),
      this.tryReadUint(chain, contractAddress, SUPPLY_FUNCTION_SIGNATURES.slice(0, 3)),
      this.tryReadUint(chain, contractAddress, [SUPPLY_FUNCTION_SIGNATURES[3]])
    ]);

    const warnings: string[] = [];
    if (!mintCandidates.length) {
      warnings.push("No known public mint selectors were found in the deployed bytecode.");
    }
    if (priceWei === null) {
      warnings.push("Price lookup failed across the common sale-price function set.");
    }

    return {
      contractAddress,
      chain,
      detectedMintFunction: mintCandidates[0] ?? null,
      priceWei,
      maxSupply,
      maxPerWallet,
      abiFragments: [...new Set([...MINT_FUNCTION_SIGNATURES, ...PRICE_FUNCTION_SIGNATURES, ...SUPPLY_FUNCTION_SIGNATURES])],
      warnings,
      scannedAt: nowIso()
    };
  }

  decodeCalldata(data: `0x${string}`): { candidate: MintFunctionCandidate | null; decodedArgs: unknown[] } {
    for (const signature of MINT_FUNCTION_SIGNATURES) {
      try {
        const iface = new Interface([signature]);
        const parsed = iface.parseTransaction({ data });

        if (parsed) {
          return {
            candidate: {
              name: parsed.name,
              signature,
              argsTemplate: parsed.args.toArray(),
              payable: true,
              score: 1
            },
            decodedArgs: parsed.args.toArray()
          };
        }
      } catch {
        continue;
      }
    }

    return { candidate: null, decodedArgs: [] };
  }

  private detectMintFunctions(bytecode: `0x${string}`): MintFunctionCandidate[] {
    const normalized = bytecode.toLowerCase();

    return MINT_FUNCTION_SIGNATURES.map((signature) => {
      const selector = selectorFor(signature).replace("0x", "").toLowerCase();
      const match = normalized.includes(selector);
      return {
        name: signature.match(/function\s+([^(]+)/)?.[1] ?? "mint",
        signature,
        argsTemplate: [],
        payable: true,
        score: match ? 100 : 0
      };
    })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);
  }

  private async tryReadUint(
    chain: ChainKey,
    contractAddress: `0x${string}`,
    fragments: string[]
  ): Promise<bigint | null> {
    for (const fragment of fragments) {
      try {
        const abi = parseAbi([fragment]);
        const functionName = fragment.match(/function\s+([^(]+)/)?.[1] as string | undefined;
        if (!functionName) {
          continue;
        }

        const value = await this.rpcRouter.executeWithFailover(chain, (runtime) =>
          runtime.publicClient.readContract({
            address: contractAddress,
            abi,
            functionName
          })
        );

        if (typeof value === "bigint") {
          return value;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}
