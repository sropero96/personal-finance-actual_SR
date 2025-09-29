import { describe, it, expect } from 'vitest';
import { duplicateDetectorTool } from '../src/mastra/tools/duplicate-detector';

async function runTool(input: any) {
  return await duplicateDetectorTool.execute({ context: input } as any);
}

describe('duplicate-detector', () => {
  const base = { date: '2025-08-26', amount: -23.10, normalizedDescription: 'mercadona compra tarjeta' };
  const prev = [
    { hash: 'aaaaaaaaaaaaaaaaaaaaaaaa', ...base },
    { hash: 'bbbbbbbbbbbbbbbbbbbbbbbb', date: '2025-08-26', amount: -12.50, normalizedDescription: 'uber trip barcelona' }
  ];

  it('detecta duplicado cuando todos los factores coinciden', async () => {
    const res = await runTool({ newTx: { hash: 'cccccccccccccccccccccccc', ...base }, previous: prev });
    expect(res.isDuplicate).toBe(true);
    expect(res.matchedHash).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(res.confidence).toBeGreaterThan(0.7);
  });

  it('no marca duplicado cuando difiere importe', async () => {
    const res = await runTool({ newTx: { hash: 'dddddddddddddddddddddddd', date: '2025-08-26', amount: -99.99, normalizedDescription: 'mercadona compra tarjeta' }, previous: prev });
    expect(res.isDuplicate).toBe(false);
  });
  
  it('grants partial credit for date +/-1 day', async () => {
  const nearPrev = { hash: 'eeeeeeeeeeeeeeeeeeeeeeee', date: '2025-08-25', amount: base.amount, normalizedDescription: base.normalizedDescription };
  const incoming = { hash: 'ffffffffffffffffffffffff', date: '2025-08-26', amount: base.amount, normalizedDescription: base.normalizedDescription };
  const res = await runTool({ newTx: incoming, previous: [nearPrev] });
    // amount + date-near + desc similarity should still exceed threshold? amount(0.5)+near(0.15)+desc(~0.2)=0.85
    expect(res.isDuplicate).toBe(true);
    expect(res.reasons).toContain('date-near');
  });

  it('partial credit for near amount (<=2%)', async () => {
    const prevTx = { hash: 'gggggggggggggggggggggggg', date: base.date, amount: -23.10, normalizedDescription: base.normalizedDescription };
    const incoming = { hash: 'hhhhhhhhhhhhhhhhhhhhhhhh', date: base.date, amount: -23.50, normalizedDescription: base.normalizedDescription }; // ~1.7% diff
    const res = await runTool({ newTx: incoming, previous: [prevTx] });
    expect(res.isDuplicate).toBe(true);
    expect(res.reasons).toContain('amount-near');
  });
});
