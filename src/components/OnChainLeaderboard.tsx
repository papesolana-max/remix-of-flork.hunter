import { useReadContract, useAccount } from "wagmi";
import { Loader2, Trophy } from "lucide-react";
import {
  FLORK_GAME_ABI,
  FLORK_GAME_ADDRESS,
  RARITY_BY_INDEX,
  formatPflork,
  shortAddr,
  type ChainLBRow,
} from "@/lib/web3/florkGame";

const RARITY_BADGE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  Common:    { bg: "bg-zinc-400/20",    text: "text-zinc-200",    border: "border-zinc-300/40",    label: "COMMON" },
  Rare:      { bg: "bg-sky-500/20",     text: "text-sky-200",     border: "border-sky-300/40",     label: "RARE" },
  Epic:      { bg: "bg-fuchsia-500/20", text: "text-fuchsia-200", border: "border-fuchsia-300/40", label: "EPIC" },
  Legendary: { bg: "bg-amber-400/25",   text: "text-amber-100",   border: "border-amber-300/50",   label: "★ LEGENDARY" },
};

export function OnChainLeaderboard() {
  const { address } = useAccount();

  const { data, isLoading, error, refetch, isFetching } = useReadContract({
    address: FLORK_GAME_ADDRESS,
    abi: FLORK_GAME_ABI,
    functionName: "getLeaderboard",
    args: [100n],
    chainId: 369,
    query: {
      refetchInterval: 30_000, // auto-refresh every 30s
    },
  });

  const rows = (data ?? []) as readonly ChainLBRow[];
  const myAddr = address?.toLowerCase();

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-6 h-6 text-yellow-400" />
        <h2 className="font-game text-base sm:text-lg tracking-wider">ON-CHAIN LEADERBOARD</h2>
        <span className="ml-auto mr-8 text-[10px] uppercase tracking-wider opacity-70 flex items-center gap-1.5 font-game-body">
          {isFetching ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
          PulseChain
        </span>
      </div>

      {isLoading ? (
        <div className="py-10 flex flex-col items-center text-white/70">
          <Loader2 className="w-6 h-6 animate-spin mb-2" />
          <span className="text-sm font-game-body">Reading on-chain leaderboard…</span>
        </div>
      ) : error ? (
        <div className="py-6 text-center text-rose-300 text-sm font-game-body">
          Failed to load: {error.message.slice(0, 120)}
          <button
            onClick={() => refetch()}
            className="block mx-auto mt-3 px-4 py-1.5 rounded-full bg-white/10 border border-white/30 text-white text-xs"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="font-game-body text-base opacity-70 text-center py-8">
          No on-chain scores yet. Be the first hunter!
        </p>
      ) : (
        <ol className="space-y-2 font-game-body">
          {rows.map((row, i) => {
            const rarityName = RARITY_BY_INDEX[row.rarity] ?? null;
            const badge = rarityName ? RARITY_BADGE[rarityName] : null;
            const isMe = myAddr && row.wallet.toLowerCase() === myAddr;
            return (
              <li
                key={`${row.wallet}-${i}`}
                className={`flex items-center gap-3 text-base rounded-xl px-3 py-2.5 border ${
                  isMe ? "border-cyan-400/70 ring-1 ring-cyan-300/40" : "border-white/5"
                }`}
                style={{
                  background: isMe
                    ? "linear-gradient(90deg, rgba(34,211,238,0.18), rgba(168,85,247,0.10))"
                    : i === 0
                      ? "linear-gradient(90deg, rgba(250,204,21,0.25), transparent)"
                      : i < 3
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.03)",
                }}
              >
                <span className="font-bold w-7 text-center text-base">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-semibold truncate text-white text-sm">
                      {row.username || "anon"}
                    </span>
                    {isMe && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-cyan-400/30 text-cyan-100 border border-cyan-300/50">
                        YOU
                      </span>
                    )}
                    {badge && (
                      <span
                        title={`Flork #${row.tokenId.toString()} · ${rarityName}`}
                        className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] opacity-60 font-mono truncate">
                    {shortAddr(row.wallet)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-yellow-300 text-sm leading-tight">
                    {row.score.toString()}
                  </div>
                  <div className="text-[10px] opacity-70 leading-tight">
                    W{row.waveReached.toString()} · {row.kills.toString()}k
                  </div>
                  {row.reward > 0n && (
                    <div className="text-[10px] text-yellow-200/90 leading-tight font-semibold">
                      +{formatPflork(row.reward)} pFLORK
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
