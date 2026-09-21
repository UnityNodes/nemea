import { createConfig, http, injected } from "wagmi";
import { arbitrum, base, mainnet } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
  },
  ssr: true,
});
