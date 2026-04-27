// FlorkGame on-chain contract integration (PulseChain Mainnet)
import type { Rarity } from "./nft";

export const FLORK_GAME_ADDRESS =
  "0x591556D251f2e2c73E5bb58f62953D051f780702" as const;

export const PFLORK_TOKEN_ADDRESS =
  "0x9Af0838B66b61F205CdDF683052B0c59d866ab07" as const;

export const FLORK_GAME_ABI = [
  {
    name: "submitScore",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "username", type: "string" },
      { name: "score", type: "uint256" },
      { name: "wave", type: "uint256" },
      { name: "kills", type: "uint256" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getLeaderboard",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "limit", type: "uint256" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "wallet", type: "address" },
          { name: "username", type: "string" },
          { name: "score", type: "uint256" },
          { name: "waveReached", type: "uint256" },
          { name: "kills", type: "uint256" },
          { name: "tokenId", type: "uint256" },
          { name: "rarity", type: "uint8" },
          { name: "reward", type: "uint256" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "previewReward",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "wave", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "cooldownRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "isNFTHolder",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getRarity",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

// uint8 rarity mapping from contract: 0=None, 1=Common, 2=Rare, 3=Epic, 4=Legendary
export const RARITY_BY_INDEX: Record<number, Rarity | null> = {
  0: null,
  1: "Common",
  2: "Rare",
  3: "Epic",
  4: "Legendary",
};

export type ChainLBRow = {
  wallet: `0x${string}`;
  username: string;
  score: bigint;
  waveReached: bigint;
  kills: bigint;
  tokenId: bigint;
  rarity: number;
  reward: bigint;
  timestamp: bigint;
};

/** Format wei → integer pFLORK (no decimals). */
export function formatPflork(wei: bigint): string {
  if (wei === 0n) return "0";
  const whole = wei / 10n ** 18n;
  return whole.toLocaleString("en-US");
}

/** Format remaining seconds → "5m 32s" / "42s". */
export function formatCooldown(secs: number): string {
  if (secs <= 0) return "Ready";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function shortAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
