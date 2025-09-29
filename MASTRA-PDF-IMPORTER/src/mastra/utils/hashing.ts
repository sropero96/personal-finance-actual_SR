import { createHash } from 'crypto';

/**
 * Deterministic transaction hash for memory lookup.
 * We keep it simple for MVP; can evolve (include account, currency, etc.).
 */
export function txHash(
  date: string,
  amount: number,
  normalizedDescription: string
): string {
  const base = `${date}|${amount}|${normalizedDescription}`;
  return createHash('sha256').update(base).digest('hex').slice(0, 24); // shorter for readability
}
