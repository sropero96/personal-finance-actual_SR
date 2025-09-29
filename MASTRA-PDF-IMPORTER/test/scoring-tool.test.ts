import { describe, it, expect } from 'vitest';
import { scoringTool } from '../src/mastra/tools/scoring-tool';

async function run(input: any) { return await scoringTool.execute({ context: input } as any); }

describe('tx-scoring', () => {
  it('combina correctamente componentes', async () => {
    const r = await run({ payeeConfidence: 0.8, categoryConfidence: 0.5, duplicateConfidence: 0.2 });
    // expected: 0.4*0.8 + 0.4*0.5 + 0.2*(1-0.2) = 0.32 + 0.20 + 0.16 = 0.68
    expect(r.score).toBeCloseTo(0.68, 3);
  });
  it('penaliza duplicado alto', async () => {
    const r = await run({ payeeConfidence: 0.8, categoryConfidence: 0.5, duplicateConfidence: 0.95 });
    // duplicatePenalty = 0.2*(1-0.95)=0.01 -> total 0.32+0.20+0.01=0.53
    expect(r.score).toBeCloseTo(0.53, 2);
  });
});
