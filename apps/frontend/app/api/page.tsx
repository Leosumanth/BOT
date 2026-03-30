import type { JSX } from "react";
import type { ContractAnalysisResult, SystemOverview } from "@mintbot/shared";
import { ApiPage } from "@/components/pages/api-page";
import { backendFetch } from "@/lib/api";
import { emptySystemOverview } from "@/lib/defaults";

export default async function ApiRoute(): Promise<JSX.Element> {
  const [overview, contracts] = await Promise.all([
    backendFetch<SystemOverview>("/system").catch(() => emptySystemOverview),
    backendFetch<ContractAnalysisResult[]>("/contracts").catch(() => [])
  ]);

  return <ApiPage contracts={contracts} overview={overview} />;
}
