"use client";

import { useState, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { WagmiProvider } from "wagmi";
import { isUnauthorized } from "@/lib/api";
import { qk } from "@/lib/queries";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const created: QueryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error) => {
          if (isUnauthorized(error)) created.setQueryData(qk.me, null);
        },
      }),
      mutationCache: new MutationCache({
        onError: (error) => {
          if (isUnauthorized(error)) created.setQueryData(qk.me, null);
        },
      }),
      defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: true } },
    });
    return created;
  });
  return (
    <QueryClientProvider client={client}>
      <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
