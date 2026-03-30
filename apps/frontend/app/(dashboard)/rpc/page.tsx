import type { JSX } from "react";
import type { RpcManagementResponse } from "@mintbot/shared";
import { RpcPage } from "@/components/pages/rpc-page";
import { backendFetch } from "@/lib/api";
import { emptyRpcManagement } from "@/lib/defaults";

export default async function RpcRoute(): Promise<JSX.Element> {
  const data = await backendFetch<RpcManagementResponse>("/rpc").catch(() => emptyRpcManagement);

  return <RpcPage data={data} />;
}
