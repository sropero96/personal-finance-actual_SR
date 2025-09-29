import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Schema for an enriched transaction (subset needed for metrics)
const enrichedTxSchema = z.object({
  normalized: z.object({
    hash: z.string(),
    date: z.string().optional(),
    amount: z.number().optional(),
    normalizedDescription: z.string().optional()
  }).optional(),
  payee: z.object({ value: z.string().optional(), confidence: z.number().optional(), source: z.string().optional() }).optional(),
  category: z.object({ value: z.string().optional(), confidence: z.number().optional(), source: z.string().optional() }).optional(),
  duplicate: z.object({ isDuplicate: z.boolean().optional(), matchedHash: z.string().nullable().optional(), confidence: z.number().optional(), reasons: z.array(z.string()).optional() }).optional(),
  score: z.object({ value: z.number().optional(), components: z.record(z.any()).optional() }).optional(),
  issues: z.array(z.string()).optional()
});

export const curationMetricsTool = createTool({
  id: 'curation-metrics',
  description: 'Calcula métricas agregadas y detecta colisiones de hash en un conjunto de transacciones enriquecidas',
  inputSchema: z.object({
    enriched: z.array(enrichedTxSchema)
  }),
  outputSchema: z.object({
    metrics: z.object({
      total: z.number(),
      normalized: z.number(),
      withPayeeSuggestion: z.number(),
      withCategorySuggestion: z.number(),
      duplicates: z.number(),
      fromMemoryPayee: z.number(),
      fromMemoryCategory: z.number(),
      avgScore: z.number()
    }),
    issuesGlobales: z.array(z.string()),
    collisions: z.array(z.string())
  }),
  execute: async ({ context }) => {
    const { enriched } = context;
    const total = enriched.length;
    let normalized = 0;
    let withPayeeSuggestion = 0;
    let withCategorySuggestion = 0;
    let duplicates = 0;
    let fromMemoryPayee = 0;
    let fromMemoryCategory = 0;
    let scoreSum = 0;

    const hashCounts: Record<string, number> = {};

    for (const tx of enriched) {
      const hash = tx.normalized?.hash;
      if (hash) {
        normalized++;
        hashCounts[hash] = (hashCounts[hash] || 0) + 1;
      }
      if (tx.payee?.value) {
        withPayeeSuggestion++;
        if (tx.payee.source === 'memory') fromMemoryPayee++;
      }
      if (tx.category?.value) {
        withCategorySuggestion++;
        if (tx.category.source === 'memory') fromMemoryCategory++;
      }
      if (tx.duplicate?.isDuplicate) duplicates++;
      if (typeof tx.score?.value === 'number') scoreSum += tx.score.value;
    }

    const collisions = Object.entries(hashCounts)
      .filter(([, c]) => c > 1)
      .map(([h]) => h);

    const issuesGlobales: string[] = [];
    if (collisions.length) issuesGlobales.push('hash_collision');

    const avgScore = total ? Number((scoreSum / total).toFixed(4)) : 0;

    return {
      metrics: {
        total,
        normalized,
        withPayeeSuggestion,
        withCategorySuggestion,
        duplicates,
        fromMemoryPayee,
        fromMemoryCategory,
        avgScore
      },
      issuesGlobales,
      collisions
    };
  }
});

export default curationMetricsTool;