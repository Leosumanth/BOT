import { clamp, type GasStrategyInput, type GasStrategyResult } from "@mintbot/shared";

export class Eip1559GasStrategy {
  derive(input: GasStrategyInput): GasStrategyResult {
    const latestBaseFee = input.latestBaseFee ?? input.historicalBaseFee ?? 0n;
    const congestion = clamp(input.networkCongestion ?? 0.45, 0, 1);

    const urgencyMultiplier =
      input.urgency === "critical" ? 1.85 : input.urgency === "high" ? 1.45 : input.urgency === "medium" ? 1.2 : 1.05;

    const priorityGwei =
      input.urgency === "critical" ? 5n : input.urgency === "high" ? 3n : input.urgency === "medium" ? 2n : 1n;

    const priorityFee = priorityGwei * 1_000_000_000n;
    const congestionBoost = BigInt(Math.ceil(Number(latestBaseFee || 0n) * congestion * 0.35));
    const maxFeePerGas = BigInt(Math.ceil(Number(latestBaseFee || 0n) * urgencyMultiplier)) + priorityFee + congestionBoost;

    return {
      maxFeePerGas,
      maxPriorityFeePerGas: priorityFee,
      confidence: clamp(0.72 + congestion * 0.18, 0, 0.98),
      reasoning: [
        `Base fee observed at ${latestBaseFee.toString()} wei.`,
        `Urgency ${input.urgency} maps to multiplier ${urgencyMultiplier.toFixed(2)}.`,
        `Congestion factor applied at ${(congestion * 100).toFixed(0)}%.`
      ]
    };
  }
}
