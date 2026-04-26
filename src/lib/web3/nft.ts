// PulseChain Flork NFT integration constants & helpers
export const FLORK_NFT_ADDRESS =
  "0x6B74DD05Bf7864E72359C6D5d0632778913ED92a" as const;

export const IPFS_BASE =
  "https://ipfs.io/ipfs/QmPg7vFYzZdUEtJg74p5LRg3heXjPWovqwWSChaA2iyhZb/flork-metadata";

export const FLORK_NFT_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

export type FlorkMetadata = {
  tokenId: number;
  name?: string;
  image?: string;
  rarity: Rarity;
  raw?: unknown;
};

export type RarityBonus = {
  speed: number;
  fireRate: number; // multiplier on fire-rate (smaller cooldown)
  damage: number;
  extraLives: number;
};

export const RARITY_BONUS: Record<Rarity, RarityBonus> = {
  Common: { speed: 1, fireRate: 1, damage: 1, extraLives: 0 },
  Rare: { speed: 1.1, fireRate: 1.15, damage: 1.1, extraLives: 0 },
  Epic: { speed: 1.2, fireRate: 1.3, damage: 1.25, extraLives: 0 },
  Legendary: { speed: 1.35, fireRate: 1.5, damage: 1.5, extraLives: 1 },
};

export const RARITY_COLORS: Record<Rarity, { bg: string; text: string; ring: string; glow: string }> = {
  Common: {
    bg: "bg-zinc-500/30",
    text: "text-zinc-200",
    ring: "ring-zinc-400",
    glow: "shadow-[0_0_18px_rgba(161,161,170,0.5)]",
  },
  Rare: {
    bg: "bg-sky-500/30",
    text: "text-sky-200",
    ring: "ring-sky-400",
    glow: "shadow-[0_0_22px_rgba(56,189,248,0.55)]",
  },
  Epic: {
    bg: "bg-fuchsia-600/30",
    text: "text-fuchsia-200",
    ring: "ring-fuchsia-400",
    glow: "shadow-[0_0_24px_rgba(217,70,239,0.65)]",
  },
  Legendary: {
    bg: "bg-amber-400/30",
    text: "text-amber-100",
    ring: "ring-amber-300",
    glow: "shadow-[0_0_28px_rgba(252,211,77,0.75)]",
  },
};

function ipfsToHttp(uri: string): string {
  if (!uri) return uri;
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

function pickRarity(raw: unknown): Rarity {
  // Try common metadata shapes: attributes[].trait_type === "Rarity"
  try {
    const obj = raw as { attributes?: Array<{ trait_type?: string; value?: string }>; rarity?: string };
    if (obj?.attributes && Array.isArray(obj.attributes)) {
      const attr = obj.attributes.find(
        (a) => (a.trait_type || "").toLowerCase() === "rarity",
      );
      if (attr?.value) {
        const v = String(attr.value).trim();
        const norm = (v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()) as Rarity;
        if (["Common", "Rare", "Epic", "Legendary"].includes(norm)) return norm;
      }
    }
    if (obj?.rarity) {
      const v = String(obj.rarity).trim();
      const norm = (v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()) as Rarity;
      if (["Common", "Rare", "Epic", "Legendary"].includes(norm)) return norm;
    }
  } catch {
    // fallthrough
  }
  return "Common";
}

export async function fetchFlorkMetadata(tokenId: number): Promise<FlorkMetadata> {
  const url = `${IPFS_BASE}/${tokenId}.json`;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = await res.json();
    return {
      tokenId,
      name: json?.name,
      image: ipfsToHttp(json?.image || ""),
      rarity: pickRarity(json),
      raw: json,
    };
  } catch {
    // IPFS failure → safe fallback
    return { tokenId, rarity: "Common" };
  }
}
