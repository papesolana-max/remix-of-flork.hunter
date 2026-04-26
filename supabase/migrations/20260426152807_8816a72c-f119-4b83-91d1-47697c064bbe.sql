-- Add NFT fields to leaderboard for PulseChain Flork integration
ALTER TABLE public.leaderboard
  ADD COLUMN IF NOT EXISTS nft_token_id integer,
  ADD COLUMN IF NOT EXISTS nft_rarity text;

-- Index for faster ordering / filtering by rarity
CREATE INDEX IF NOT EXISTS idx_leaderboard_score_desc ON public.leaderboard (score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_nft_rarity ON public.leaderboard (nft_rarity);

-- Update INSERT policy to allow optional NFT fields and validate them
DROP POLICY IF EXISTS "Anyone can submit a score" ON public.leaderboard;

CREATE POLICY "Anyone can submit a score"
  ON public.leaderboard
  FOR INSERT
  TO public
  WITH CHECK (
    char_length(username) >= 1
    AND char_length(username) <= 32
    AND char_length(wallet) >= 4
    AND char_length(wallet) <= 128
    AND score >= 0
    AND score <= 1000000
    AND (nft_token_id IS NULL OR (nft_token_id >= 0 AND nft_token_id <= 100000))
    AND (nft_rarity IS NULL OR nft_rarity IN ('Common', 'Rare', 'Epic', 'Legendary'))
  );