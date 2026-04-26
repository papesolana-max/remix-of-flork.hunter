import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Wallet, LogOut, AlertTriangle } from "lucide-react";

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const wrongNetwork = isConnected && chainId !== 369;
  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  if (!isConnected) {
    return (
      <button
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        disabled={isPending}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-game-body text-sm tracking-wider uppercase text-white border-2 border-cyan-400/70 bg-gradient-to-r from-cyan-600/40 to-fuchsia-600/40 hover:from-cyan-500/60 hover:to-fuchsia-500/60 backdrop-blur-sm shadow-[0_0_22px_rgba(34,211,238,0.45)] transition-all hover:scale-105 active:scale-95 disabled:opacity-60"
      >
        <Wallet className="w-4 h-4" />
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  if (wrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: 369 })}
        disabled={switching}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-game-body text-xs tracking-wider uppercase text-white border-2 border-amber-400/80 bg-amber-600/40 hover:bg-amber-500/60 shadow-[0_0_20px_rgba(251,191,36,0.55)] transition-all"
      >
        <AlertTriangle className="w-4 h-4" />
        {switching ? "Switching…" : "Switch to PulseChain"}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-emerald-400/50 text-white text-xs font-mono backdrop-blur-sm shadow-[0_0_18px_rgba(16,185,129,0.35)]">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <span className="opacity-90">{address ? shortAddr(address) : ""}</span>
      <button
        onClick={() => disconnect()}
        title="Disconnect"
        className="ml-1 opacity-60 hover:opacity-100"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
