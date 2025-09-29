import { describe, it, expect } from 'vitest';
import { normalizeTransactionTool } from '../src/mastra/tools/normalize-transaction';

async function runTool(input: any) {
  return await normalizeTransactionTool.execute({ context: input } as any);
}

describe('normalize-transaction', () => {
  it('normaliza fecha DD/MM/YYYY y parsea importe negativo con coma', async () => {
    const out = await runTool({ date: '26/08/2025', description: 'MERCADONA COMPRA 123456', amount: '-23,10' });
    expect(out.date).toBe('2025-08-26');
    expect(out.amount).toBe(-23.10);
    expect(out.normalizedDescription).toContain('mercadona');
    expect(out.hash).toHaveLength(24);
  });

  it('acepta fecha ISO y importe número', async () => {
    const out = await runTool({ date: '2025-08-26', description: 'Uber Trip Barcelona', amount: -12.5 });
    expect(out.date).toBe('2025-08-26');
    expect(out.amount).toBe(-12.5);
  });

  it('elimina referencias largas y acentos', async () => {
    const out = await runTool({ date: '26/08/2025', description: 'CAFÉ ÁRBOL REF XYZ123456 CODIGO 987654321', amount: '10,00' });
    expect(out.normalizedDescription).not.toMatch(/123456/);
    expect(out.normalizedDescription).toContain('cafe');
    expect(out.normalizedDescription).toContain('arbol');
  });

  it('lanza error en importe inválido', async () => {
    await expect(runTool({ date: '2025-08-26', description: 'X', amount: 'abc' }))
      .rejects.toThrow('Amount parsing failed');
  });
});
