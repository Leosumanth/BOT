"use client";

import type { JSX, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig, WagmiProvider } from "wagmi";
import { mainnet, base } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { useState } from "react";

export function AppProviders({ children }: { children: ReactNode }): JSX.Element {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig] = useState(() =>
    createConfig({
      chains: [mainnet, base],
      connectors: [injected()],
      transports: {
        [mainnet.id]: http(),
        [base.id]: http()
      }
    })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
