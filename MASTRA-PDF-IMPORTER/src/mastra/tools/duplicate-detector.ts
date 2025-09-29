import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// We accept an array of candidate prior transactions and a new normalized one, returning possible duplicates.
// This avoids adding persistence complexity now; caller provides context window.

const CandidateTx = z.object({
  hash: z.string(),
  date: z.string(),
  amount: z.number(),
  normalizedDescription: z.string()
});

export const duplicateDetectorTool = createTool({
  id: 'duplicate-detector',
  description: 'Detects likely duplicate of a new transaction among prior ones using heuristic similarity',
  inputSchema: z.object({
    newTx: CandidateTx,
    previous: z.array(CandidateTx).max(200).describe('Recent prior transactions (normalized) for comparison')
  }),
  outputSchema: z.object({
    isDuplicate: z.boolean(),
    matchedHash: z.string().nullable(),
    confidence: z.number(),
    reasons: z.array(z.string()),
    evaluated: z.number()
  }),
  execute: async ({ context }) => {
    const { newTx, previous } = context;
    let bestScore = 0;
    let best: typeof previous[number] | null = null;
    const reasons: string[] = [];

    for (const p of previous) {
      let score = 0;
      const localReasons: string[] = [];

      const amountDelta = Math.abs(p.amount - newTx.amount);
      if (p.amount === newTx.amount) {
        score += 0.5;
        localReasons.push('amount-match');
      } else if (amountDelta <= 0.02 * Math.max(1, Math.abs(newTx.amount))) { // 2% tolerance
        score += 0.35; // partial credit
        localReasons.push('amount-near');
      }

      const dateDelta = dayDiff(p.date, newTx.date);
      if (dateDelta === 0) {
        score += 0.3;
        localReasons.push('date-exact');
      } else if (Math.abs(dateDelta) === 1) {
        score += 0.15; // partial credit for +/-1 day
        localReasons.push('date-near');
      }

      const prefix = commonPrefix(p.normalizedDescription, newTx.normalizedDescription);
      const sim = prefix.length / Math.max(1, Math.min(p.normalizedDescription.length, newTx.normalizedDescription.length));
      const descComponent = 0.2 * Math.min(1, sim);
      if (descComponent > 0) localReasons.push('desc-similarity');
      score += descComponent;

      if (score > bestScore) {
        bestScore = score;
        best = { ...p, _reasons: localReasons } as any;
      }
    }

    if (best && bestScore >= 0.75) {
      reasons.push(...(best as any)._reasons);
      return { isDuplicate: true, matchedHash: best.hash, confidence: Number(bestScore.toFixed(2)), reasons: Array.from(new Set(reasons)), evaluated: previous.length };
    }

    return { isDuplicate: false, matchedHash: null, confidence: Number(bestScore.toFixed(2)), reasons: [], evaluated: previous.length };
  }
});

function commonPrefix(a: string, b: string): string {
  let i = 0;
  const len = Math.min(a.length, b.length);
  while (i < len && a[i] === b[i]) i++;
  return a.slice(0, i);
}

function dayDiff(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 9999;
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((da - db) / ms);
}
