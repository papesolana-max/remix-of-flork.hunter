import { useEffect, useState } from "react";
import { useAccount, useReadContract, usePublicClient } from "wagmi";
import {
  FLORK_NFT_ABI,
  FLORK_NFT_ADDRESS,
  fetchFlorkMetadata,
  type FlorkMetadata,
} from "@/lib/web3/nft";

type State = {
  loading: boolean;
  nfts: FlorkMetadata[];
  error: string | null;
};

/**
 * Reads all Flork NFT token IDs owned by the connected wallet,
 * then resolves their metadata (name + rarity) from IPFS.
 *
 * READ-ONLY — no transactions.
 */
export function useFlorkNfts() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [state, setState] = useState<State>({ loading: false, nfts: [], error: null });

  // Step 1: balanceOf
  const { data: balance, error: balanceError } = useReadContract({
    address: FLORK_NFT_ADDRESS,
    abi: FLORK_NFT_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: 369,
    query: { enabled: !!address && isConnected && chainId === 369 },
  });

  // Step 2: enumerate token ids + fetch metadata
  useEffect(() => {
    let cancelled = false;
    if (!address || !isConnected || chainId !== 369 || !publicClient) {
      setState({ loading: false, nfts: [], error: null });
      return;
    }
    const total = balance ? Number(balance) : 0;
    if (balanceError) {
      setState({ loading: false, nfts: [], error: balanceError.message });
      return;
    }
    if (total === 0) {
      setState({ loading: false, nfts: [], error: null });
      return;
    }

    setState({ loading: true, nfts: [], error: null });
    (async () => {
      try {
        const idxs = Array.from({ length: total }, (_, i) => i);
        const ids = await Promise.all(
          idxs.map((i) =>
            publicClient.readContract({
              address: FLORK_NFT_ADDRESS,
              abi: FLORK_NFT_ABI,
              functionName: "tokenOfOwnerByIndex",
              args: [address, BigInt(i)],
            }),
          ),
        );
        const tokenIds = ids.map((b) => Number(b as bigint));
        const metas = await Promise.all(tokenIds.map((id) => fetchFlorkMetadata(id)));
        if (!cancelled) setState({ loading: false, nfts: metas, error: null });
      } catch (e) {
        if (!cancelled) {
          setState({
            loading: false,
            nfts: [],
            error: e instanceof Error ? e.message : "Failed to load NFTs",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, chainId, balance, balanceError, publicClient]);

  return state;
}
