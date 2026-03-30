import type { JSX } from "react";
import type { WalletRecord } from "@mintbot/shared";
import { WalletsPage } from "@/components/pages/wallets-page";
import { backendFetch } from "@/lib/api";

export default async function WalletsRoute(): Promise<JSX.Element> {
  const wallets = await backendFetch<WalletRecord[]>("/wallets").catch(() => []);

  return <WalletsPage wallets={wallets} />;
}
