import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import florkImg from "@/assets/flork.png";
import { useFlorkNfts } from "@/hooks/useFlorkNfts";
import { RARITY_BONUS, RARITY_COLORS, type FlorkMetadata, type Rarity } from "@/lib/web3/nft";

export type SelectedCharacter =
  | { kind: "guest" }
  | { kind: "nft"; tokenId: number; rarity: Rarity; image?: string; name?: string };

export function CharacterSelect({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (s: SelectedCharacter) => void;
}) {
  const { loading, nfts, error } = useFlorkNfts();
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (open && picked === null && nfts.length > 0) {
      setPicked(nfts[0].tokenId);
    }
  }, [open, nfts, picked]);

  if (!open) return null;

  const confirm = () => {
    const meta = nfts.find((n) => n.tokenId === picked);
    if (meta) {
      onSelect({
        kind: "nft",
        tokenId: meta.tokenId,
        rarity: meta.rarity,
        image: meta.image,
        name: meta.name,
      });
    } else {
      onSelect({ kind: "guest" });
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border-2 border-fuchsia-400/40 bg-gradient-to-b from-zinc-900/95 to-black/95 p-5 sm:p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 0 80px rgba(217, 70, 239, 0.35)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 text-white flex items-center justify-center"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-fuchsia-300" />
          <h2 className="font-game text-base sm:text-lg tracking-wider">SELECT YOUR FLORK</h2>
        </div>
        <p className="font-game-body text-xs sm:text-sm opacity-70 mb-4">
          Pick an NFT to apply its in-game stat bonuses, or play as the guest skin.
        </p>

        {loading ? (
          <div className="py-10 text-center font-game-body opacity-80">Reading your wallet…</div>
        ) : error ? (
          <div className="py-6 text-center font-game-body text-red-300 text-sm">
            Could not load NFTs: {error}
          </div>
        ) : nfts.length === 0 ? (
          <GuestOnly />
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {nfts.map((n) => (
              <NftCard
                key={n.tokenId}
                meta={n}
                selected={picked === n.tokenId}
                onClick={() => setPicked(n.tokenId)}
              />
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <button
            onClick={() => onSelect({ kind: "guest" })}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 text-white text-sm font-game-body tracking-wider uppercase"
          >
            Play as Guest
          </button>
          <button
            onClick={confirm}
            disabled={nfts.length > 0 && picked === null}
            className="px-6 py-2.5 rounded-full text-white text-sm font-game-body tracking-wider uppercase disabled:opacity-50"
            style={{
              background: "linear-gradient(90deg,#22d3ee,#a855f7,#ec4899)",
              boxShadow: "0 0 24px rgba(168,85,247,0.6)",
            }}
          >
            {nfts.length > 0 ? "Confirm & Hunt" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NftCard({
  meta,
  selected,
  onClick,
}: {
  meta: FlorkMetadata;
  selected: boolean;
  onClick: () => void;
}) {
  const c = RARITY_COLORS[meta.rarity];
  const b = RARITY_BONUS[meta.rarity];
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left rounded-xl p-2 border-2 transition-all hover:scale-[1.02] ${
          selected ? `${c.ring} ring-2 border-white/30 ${c.glow}` : "border-white/10 hover:border-white/30"
        } ${c.bg}`}
      >
        <div className="aspect-square rounded-lg overflow-hidden bg-black/40 mb-2 flex items-center justify-center">
          {meta.image ? (
            <img
              src={meta.image}
              alt={meta.name || `Flork #${meta.tokenId}`}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = florkImg;
              }}
            />
          ) : (
            <img src={florkImg} alt="" className="w-2/3 h-2/3 object-contain" />
          )}
        </div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono opacity-80">#{meta.tokenId}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${c.text} ${c.bg} border ${c.ring.replace("ring-", "border-")}`}>
            {meta.rarity}
          </span>
        </div>
        <div className="text-[10px] font-game-body opacity-75 leading-tight">
          SPD ×{b.speed.toFixed(2)} · DMG ×{b.damage.toFixed(2)} · RoF ×{b.fireRate.toFixed(2)}
          {b.extraLives > 0 && <span className="text-amber-300"> · +{b.extraLives} ❤️</span>}
        </div>
      </button>
    </li>
  );
}

function GuestOnly() {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-center">
      <img src={florkImg} alt="" className="w-20 h-20 mx-auto mb-2 opacity-90" />
      <div className="font-game-body text-sm opacity-90">No Flork NFTs in this wallet.</div>
      <div className="font-game-body text-xs opacity-60 mt-1">
        You can still hunt as the default Flork — but you won't get rarity bonuses.
      </div>
    </div>
  );
}
