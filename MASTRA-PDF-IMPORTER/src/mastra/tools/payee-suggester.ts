import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Reuse same memory directory convention as memory tools
const MEMORY_DIR = path.resolve(process.cwd(), 'data', 'memory');

interface UserMemoryFile {
  payeeMap: Record<string, string>;
  categoryMap: Record<string, string>; // unused here but retained for parity
  corrections: Array<{ txHash: string; newPayee?: string; newCategory?: string; timestamp: number }>;
  historyVersion: number;
}

function loadMemory(userId: string): UserMemoryFile | null {
  try {
    const file = path.join(MEMORY_DIR, `${userId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as UserMemoryFile;
  } catch {
    return null;
  }
}

function heuristicPayee(normalizedDescription: string): string {
  // Take first 3 tokens excluding obvious stopwords & numbers
  const STOP = new Set(['de', 'el', 'la', 'en', 'para', 'por', 'a', 'the', 'and']);
  const tokens = normalizedDescription.split(' ').filter(t => t && !STOP.has(t) && !/^[0-9]+$/.test(t));
  const candidate = tokens.slice(0, 3).join(' ');
  return candidate ? candidate.toUpperCase() : 'UNKNOWN';
}

export const payeeSuggesterTool = createTool({
  id: 'payee-suggester',
  description: 'Suggests a canonical payee for a transaction using stored memory (hash match) with heuristic fallback',
  inputSchema: z.object({
    userId: z.string().min(1),
    hash: z.string().min(1).describe('Deterministic transaction hash'),
    normalizedDescription: z.string().min(1),
    amount: z.number().optional()
  }),
  outputSchema: z.object({
    userId: z.string(),
    hash: z.string(),
    suggestedPayee: z.string(),
    confidence: z.number().min(0).max(1),
    source: z.enum(['memory', 'heuristic', 'fallback'])
  }),
  execute: async ({ context }) => {
  const { userId, hash, normalizedDescription, amount } = context;
    const memory = loadMemory(userId);

  // Secondary key: normalizedDescription + amount bucket (±1) to generalize suggestions
  const bucket = typeof amount === 'number' ? Math.round(amount) : null;
  const secondaryKey = bucket !== null ? `${normalizedDescription}::${bucket}` : null;

    if (memory && memory.payeeMap[hash]) {
      return {
        userId,
        hash,
        suggestedPayee: memory.payeeMap[hash],
        confidence: 1,
        source: 'memory' as const
      };
    }

    if (memory && secondaryKey && memory.payeeMap[secondaryKey]) {
      return {
        userId,
        hash,
        suggestedPayee: memory.payeeMap[secondaryKey],
        confidence: 0.85,
        source: 'memory' as const
      };
    }

    const heuristic = heuristicPayee(normalizedDescription);
    if (heuristic && heuristic !== 'UNKNOWN') {
      return {
        userId,
        hash,
        suggestedPayee: heuristic,
        confidence: 0.4,
        source: 'heuristic' as const
      };
    }

  return {
      userId,
      hash,
      suggestedPayee: 'UNKNOWN',
      confidence: 0.1,
      source: 'fallback' as const
    };
  }
});
