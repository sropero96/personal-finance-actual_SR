import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const scoringTool = createTool({
  id: 'tx-scoring',
  description: 'Produces a composite confidence score for enriched transaction attributes',
  inputSchema: z.object({
    payeeConfidence: z.number().min(0).max(1),
    categoryConfidence: z.number().min(0).max(1),
    duplicateConfidence: z.number().min(0).max(1).describe('Confidence that it IS a duplicate (penalized)'),
  }),
  outputSchema: z.object({
    score: z.number(),
    components: z.object({
      payee: z.number(),
      category: z.number(),
      duplicatePenalty: z.number()
    })
  }),
  execute: async ({ context }) => {
    const { payeeConfidence, categoryConfidence, duplicateConfidence } = context;
    const payee = 0.4 * payeeConfidence;
    const category = 0.4 * categoryConfidence;
    const duplicatePenalty = 0.2 * (1 - duplicateConfidence); // reward non-duplicate
    const score = Number((payee + category + duplicatePenalty).toFixed(3));
    return { score, components: { payee, category, duplicatePenalty } };
  }
});
