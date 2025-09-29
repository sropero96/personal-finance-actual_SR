import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Internal helper functions (colocated instead of a separate utils module to align with repo conventions)
// Accent map kept minimal; extend if new characters appear.
const ACCENT_MAP: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a', ã: 'a', Á: 'a', À: 'a', Ä: 'a', Â: 'a', Ã: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e', É: 'e', È: 'e', Ë: 'e', Ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i', Í: 'i', Ì: 'i', Ï: 'i', Î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o', õ: 'o', Ó: 'o', Ò: 'o', Ö: 'o', Ô: 'o', Õ: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u', Ú: 'u', Ù: 'u', Ü: 'u', Û: 'u',
  ñ: 'n', Ñ: 'n'
};
const stripAccents = (v: string) => v.split('').map(c => ACCENT_MAP[c] || c).join('');
const normalizeWhitespace = (v: string) => v.replace(/\s+/g, ' ').trim();
// Remove standalone long alphanumeric tokens (>=6) AND patterns like 'ref XYZ123456' or 'codigo 987654321'
const removeReferenceNumbers = (v: string) => {
  return v
    // remove tokens introduced by ref/codigo labels
    .replace(/\b(ref|codigo)\s+[0-9a-zA-Z]{4,}\b/g, '$1')
    // remove remaining long mixed tokens
    .replace(/\b[0-9A-Z]{6,}\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();
};
const baseNormalizedKey = (d: string) => normalizeWhitespace(stripAccents(removeReferenceNumbers(d.toLowerCase())));
import { createHash } from 'crypto';
const txHash = (date: string, amount: number, normalizedDescription: string) =>
  createHash('sha256').update(`${date}|${amount}|${normalizedDescription}`).digest('hex').slice(0, 24);

// Basic number normalization supporting Spanish format like 1.234,56 or -23,10
function parseAmount(raw: string): number {
  let v = raw.trim();
  // Replace thousand separators and convert comma decimal to dot
  v = v.replace(/\./g, '').replace(/,/g, '.');
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Invalid amount: ${raw}`);
  return n;
}

export const normalizeTransactionTool = createTool({
  id: 'normalize-transaction',
  description: 'Normalizes a raw transaction into canonical fields, producing hash & normalized description',
  inputSchema: z.object({
    date: z.string().describe('Original transaction date (YYYY-MM-DD or DD/MM/YYYY)'),
    description: z.string(),
    amount: z.union([z.number(), z.string()]).describe('Signed amount'),
  }),
  outputSchema: z.object({
    date: z.string(),
    amount: z.number(),
    normalizedDescription: z.string(),
    hash: z.string(),
    raw: z.object({ date: z.string(), description: z.string(), amount: z.string() }),
  }),
  execute: async ({ context }) => {
    const { date, description } = context;
    let amountNum: number;
    try {
      amountNum = typeof context.amount === 'number' ? context.amount : parseAmount(context.amount);
    } catch (e) {
      throw new Error(`Amount parsing failed: ${(e as Error).message}`);
    }

    // Date normalization (accept DD/MM/YYYY -> YYYY-MM-DD)
    let normDate = date.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(normDate)) {
      const [d, m, y] = normDate.split('/');
      normDate = `${y}-${m}-${d}`;
    }

    const lowered = description.toLowerCase();
    const noAccents = stripAccents(lowered);
    const whitespace = normalizeWhitespace(noAccents);
    const normalizedDescription = baseNormalizedKey(whitespace);

    const hash = txHash(normDate, amountNum, normalizedDescription);

    return {
      date: normDate,
      amount: amountNum,
      normalizedDescription,
      hash,
      raw: {
        date,
        description,
        amount: String(context.amount)
      }
    };
  }
});
