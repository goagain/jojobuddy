export type CraftScore = {
  rank: string;
  overall: number;
};

export function formatCraftScore(score: CraftScore) {
  return `${score.rank} ${score.overall}`;
}
