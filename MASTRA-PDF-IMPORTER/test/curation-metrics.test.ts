import { describe, it, expect } from 'vitest';
import { curationMetricsTool } from '../src/mastra/tools/curation-metrics';

async function run(enriched: any[]) {
  return await curationMetricsTool.execute({ context: { enriched } } as any);
}

describe('curation-metrics', () => {
  it('calcula métricas básicas y detecta colisiones', async () => {
    const enriched = [
      {
        normalized: { hash: 'h1', date: '2025-08-26', amount: -10, normalizedDescription: 'a' },
        payee: { value: 'MERCADONA', source: 'memory', confidence: 0.9 },
        category: { value: 'SUPERMERCADO', source: 'keyword', confidence: 0.7 },
        duplicate: { isDuplicate: false, matchedHash: null, confidence: 0, reasons: [] },
        score: { value: 0.8 }
      },
      {
        normalized: { hash: 'h1', date: '2025-08-27', amount: -12, normalizedDescription: 'a' }, // collision
        payee: { value: 'MERCADONA', source: 'memory', confidence: 0.92 },
        category: { value: 'SUPERMERCADO', source: 'keyword', confidence: 0.72 },
        duplicate: { isDuplicate: true, matchedHash: 'h1', confidence: 0.85, reasons: ['amount-match'] },
        score: { value: 0.6 }
      }
    ];

    const out = await run(enriched);
    expect(out.metrics.total).toBe(2);
    expect(out.metrics.normalized).toBe(2);
    expect(out.metrics.withPayeeSuggestion).toBe(2);
    expect(out.metrics.duplicates).toBe(1);
    expect(out.collisions).toContain('h1');
    expect(out.issuesGlobales).toContain('hash_collision');
    expect(out.metrics.avgScore).toBeCloseTo((0.8 + 0.6) / 2, 5);
  });
});