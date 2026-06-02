/**
 * Pure scoring logic — mirror of public.calculate_match_scores / calculate_live_scores.
 * Keep these rules in sync with the Postgres functions of the same name.
 *
 * Priority:
 *   +5  Exact (placar idêntico)
 *   -1  Inverse (placar espelhado, ex.: 2x1 vs 1x2)
 *   +2  Trend (acertou vencedor ou empate)
 *    0  Miss
 *   -2  Did not submit a prediction (handled separately by `missedPredictionPoints`)
 */

export const MISSED_PREDICTION_POINTS = -2 as const;

export type Prediction = { home: number; away: number };
export type Result = { home: number; away: number };

export function calcPoints(pred: Prediction, result: Result): number {
  if (pred.home === result.home && pred.away === result.away) return 5;
  if (pred.home === result.away && pred.away === result.home) return -1;
  const predDiff = Math.sign(pred.home - pred.away);
  const resDiff = Math.sign(result.home - result.away);
  if (predDiff === resDiff) return 2;
  return 0;
}
