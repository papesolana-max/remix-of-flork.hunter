import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";

// PulseChain Mainnet (chainId 369)
export const pulsechain = defineChain({
  id: 369,
  name: "PulseChain",
  nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.pulsechain.com"] },
    public: { http: ["https://rpc.pulsechain.com"] },
  },
  blockExplorers: {
    default: { name: "PulseScan", url: "https://scan.pulsechain.com" },
  },
});

export const config = createConfig({
  chains: [pulsechain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [pulsechain.id]: http("https://rpc.pulsechain.com"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
