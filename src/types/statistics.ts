export interface SimilarOddsDistribution {
  "1": number | null;
  X: number | null;
  "2": number | null;
}

export interface MatchStats {
  sample_size: number | null;
  similar_odds_distribution: SimilarOddsDistribution | null;
  over_2_5_rate: number | null;
  btts_rate: number | null;
}