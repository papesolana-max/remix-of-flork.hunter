import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Loader2, Send, Trophy, AlertTriangle, Check, Coins, Clock } from "lucide-react";
import {
  FLORK_GAME_ABI,
  FLORK_GAME_ADDRESS,
  formatCooldown,
  formatPflork,
} from "@/lib/web3/florkGame";
import type { SelectedCharacter } from "@/components/CharacterSelect";

type Props = {
  selected: SelectedCharacter;
  score: number;
  wave: number;
  kills: number;
  onShowLeaderboard: () => void;
  onPlayAgain: () => void;
};

export function OnChainSubmit({
  selected,
  score,
  wave,
  kills,
  onShowLeaderboard,
  onPlayAgain,
}: Props) {
  const { address, isConnected, chainId } = useAccount();
  const onPulseChain = isConnected && chainId === 369;
  const tokenId = selected.kind === "nft" ? BigInt(selected.tokenId) : 0n;

  const [username, setUsername] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Preview reward
  const { data: previewWei } = useReadContract({
    address: FLORK_GAME_ADDRESS,
    abi: FLORK_GAME_ABI,
    functionName: "previewReward",
    args: [tokenId, BigInt(wave)],
    chainId: 369,
    query: { enabled: onPulseChain },
  });

  // Cooldown
  const { data: cooldownSec, refetch: refetchCooldown } = useReadContract({
    address: FLORK_GAME_ADDRESS,
    abi: FLORK_GAME_ABI,
    functionName: "cooldownRemaining",
    args: address ? [address] : undefined,
    chainId: 369,
    query: { enabled: !!address && onPulseChain, refetchInterval: 15_000 },
  });

  // Decreasing cooldown display (recompute locally each second from a cached fetch)
  const [cooldownAnchor, setCooldownAnchor] = useState<{ at: number; secs: number } | null>(null);
  useEffect(() => {
    if (cooldownSec !== undefined) {
      setCooldownAnchor({ at: Math.floor(Date.now() / 1000), secs: Number(cooldownSec) });
    }
  }, [cooldownSec]);
  const liveCooldown = cooldownAnchor ? Math.max(0, cooldownAnchor.secs - (now - cooldownAnchor.at)) : 0;

  // Write tx
  const { data: txHash, writeContract, isPending: isSigning, error: writeError, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess: isMined, error: mineError } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: 369,
  });

  useEffect(() => {
    if (isMined) refetchCooldown();
  }, [isMined, refetchCooldown]);

  if (!isConnected) {
    return (
      <div className="w-full max-w-sm bg-white/10 rounded-2xl p-4 border border-white/20 text-center">
        <Trophy className="w-7 h-7 mx-auto mb-1 text-yellow-300" />
        <div className="text-white/90 text-sm font-semibold">Guest Mode</div>
        <div className="text-white/70 text-xs mt-1">
          Connect your wallet to submit this score on-chain and earn pFLORK.
        </div>
        <button
          onClick={onPlayAgain}
          className="mt-3 px-6 py-2 rounded-full font-bold text-white text-sm bg-white/20 border border-white/30 hover:bg-white/30"
        >
          Play Again
        </button>
      </div>
    );
  }

  if (!onPulseChain) {
    return (
      <div className="w-full max-w-sm bg-amber-500/15 rounded-2xl p-4 border border-amber-400/40 text-center">
        <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-amber-300" />
        <div className="text-amber-100 text-sm font-semibold">Wrong network</div>
        <div className="text-amber-200/80 text-xs mt-1">
          Switch to PulseChain Mainnet to submit scores on-chain.
        </div>
      </div>
    );
  }

  // Success state
  if (isMined && txHash) {
    const earned = previewWei ?? 0n;
    return (
      <div className="w-full max-w-sm bg-emerald-500/15 rounded-2xl p-5 border border-emerald-400/40 text-center">
        <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-400/30 border border-emerald-300 flex items-center justify-center">
          <Check className="w-6 h-6 text-emerald-200" />
        </div>
        <div className="text-emerald-100 font-bold">Score submitted on-chain ✅</div>
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/20 border border-yellow-300/50 text-yellow-100 text-sm font-semibold">
          <Coins className="w-4 h-4" /> +{formatPflork(earned)} pFLORK
        </div>
        <a
          href={`https://scan.pulsechain.com/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="block mt-2 text-[11px] text-emerald-200/70 underline truncate"
        >
          View transaction
        </a>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onShowLeaderboard}
            className="flex-1 py-2 rounded-full font-bold text-white text-sm"
            style={{ background: "var(--gradient-flork)" }}
          >
            🏆 Leaderboard
          </button>
          <button
            onClick={() => { reset(); onPlayAgain(); }}
            className="flex-1 py-2 rounded-full font-bold text-white text-sm bg-white/15 border border-white/30 hover:bg-white/25"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  const inCooldown = liveCooldown > 0;
  const errMsg = (writeError || mineError)?.message;
  const friendlyErr = errMsg
    ? errMsg.includes("User rejected") || errMsg.includes("User denied")
      ? "Transaction rejected in wallet."
      : errMsg.length > 160
        ? errMsg.slice(0, 160) + "…"
        : errMsg
    : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    writeContract({
      address: FLORK_GAME_ADDRESS,
      abi: FLORK_GAME_ABI,
      functionName: "submitScore",
      args: [
        username.trim().slice(0, 32),
        BigInt(score),
        BigInt(wave),
        BigInt(kills),
        tokenId,
      ],
      chainId: 369,
    });
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-white/10 rounded-2xl p-4 border border-white/20 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-white/90 text-sm font-semibold">Submit on-chain</div>
        <div className="text-[10px] font-mono text-emerald-300 inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> PulseChain
        </div>
      </div>

      {/* Connected wallet (auto) */}
      <div className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-white/80 truncate">
        {address}
      </div>

      <input
        type="text"
        placeholder="Username (1–32 chars)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        maxLength={32}
        required
        className="w-full px-3 py-2 rounded-lg bg-white/90 text-black text-sm placeholder:text-black/50 focus:outline-none focus:ring-2 focus:ring-pink-400"
      />

      {/* Reward + cooldown panel */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-yellow-400/10 border border-yellow-300/30 p-2">
          <div className="flex items-center gap-1 text-yellow-200 font-semibold uppercase tracking-wider text-[10px]">
            <Coins className="w-3 h-3" /> Reward
          </div>
          <div className="text-yellow-100 font-bold text-sm mt-0.5">
            {previewWei !== undefined ? `${formatPflork(previewWei)} pFLORK` : "—"}
          </div>
          {selected.kind !== "nft" && (
            <div className="text-yellow-200/70 text-[10px] mt-0.5">No NFT → 0 reward</div>
          )}
        </div>
        <div className={`rounded-lg p-2 border ${inCooldown ? "bg-rose-500/10 border-rose-300/40" : "bg-emerald-500/10 border-emerald-300/30"}`}>
          <div className={`flex items-center gap-1 font-semibold uppercase tracking-wider text-[10px] ${inCooldown ? "text-rose-200" : "text-emerald-200"}`}>
            <Clock className="w-3 h-3" /> Cooldown
          </div>
          <div className={`font-bold text-sm mt-0.5 ${inCooldown ? "text-rose-100" : "text-emerald-100"}`}>
            {formatCooldown(liveCooldown)}
          </div>
        </div>
      </div>

      {friendlyErr && (
        <div className="text-rose-300 text-xs bg-rose-500/10 border border-rose-400/30 rounded-md px-2 py-1.5">
          {friendlyErr}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSigning || isMining || inCooldown || !username.trim()}
          className="flex-1 py-2.5 rounded-full font-bold text-white text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
          style={{ background: "var(--gradient-flork)" }}
        >
          {isSigning ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Confirm in wallet…</>
          ) : isMining ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Mining tx…</>
          ) : inCooldown ? (
            <>Come back in {formatCooldown(liveCooldown)}</>
          ) : (
            <><Send className="w-4 h-4" /> Submit Score</>
          )}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="px-4 py-2.5 rounded-full font-bold text-white text-sm bg-white/15 border border-white/30 hover:bg-white/25"
        >
          Skip
        </button>
      </div>
    </form>
  );
}
