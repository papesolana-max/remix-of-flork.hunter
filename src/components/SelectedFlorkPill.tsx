import { Sparkles } from "lucide-react";
import { RARITY_COLORS } from "@/lib/web3/nft";
import type { SelectedCharacter } from "@/components/CharacterSelect";

export function SelectedFlorkPill({
  selected,
  connected,
  onOpen,
}: {
  selected: SelectedCharacter;
  connected: boolean;
  onOpen: () => void;
}) {
  if (selected.kind === "nft") {
    const c = RARITY_COLORS[selected.rarity];
    return (
      <button
        onClick={onOpen}
        className={`pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 ${c.bg} ${c.text} ${c.glow} backdrop-blur-sm hover:scale-105 transition-transform`}
        style={{ borderColor: "rgba(255,255,255,0.35)" }}
      >
        {selected.image && (
          <img src={selected.image} alt="" className="w-6 h-6 rounded-full object-cover ring-1 ring-white/40" />
        )}
        <span className="text-xs font-game-body uppercase tracking-wider">
          {selected.rarity === "Legendary" ? "★ " : ""}Flork #{selected.tokenId} · {selected.rarity}
        </span>
        <Sparkles className="w-3.5 h-3.5 opacity-80" />
      </button>
    );
  }
  return (
    <button
      onClick={onOpen}
      disabled={!connected}
      className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-white/30 bg-black/55 text-white text-xs font-game-body uppercase tracking-wider backdrop-blur-sm hover:bg-black/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      title={connected ? "Pick a Flork NFT" : "Connect wallet to pick an NFT"}
    >
      <Sparkles className="w-3.5 h-3.5" />
      {connected ? "Choose Flork NFT" : "Guest Flork (no NFT)"}
    </button>
  );
}
