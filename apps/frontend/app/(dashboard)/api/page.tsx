import type { JSX } from "react";
import type { ApiKeysDashboardResponse } from "@mintbot/shared";
import { ApiPage } from "@/components/pages/api-page";
import { backendFetch } from "@/lib/api";
import { emptyApiKeysDashboard } from "@/lib/defaults";

export default async function ApiRoute(): Promise<JSX.Element> {
  const dashboard = await backendFetch<ApiKeysDashboardResponse>("/api-keys").catch(() => emptyApiKeysDashboard);

  return <ApiPage dashboard={dashboard} />;
}
