import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.resolve(process.cwd(), 'data', 'memory');

interface UserMemoryFile {
  payeeMap: Record<string, string>;
  categoryMap: Record<string, string>;
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

const KEYWORDS: Array<{ category: string; patterns: RegExp[] }> = [
  { category: 'SUPERMERCADO', patterns: [/mercadona/i, /carrefour/i, /supermercado/i, /aldi/i, /lidl/i] },
  { category: 'RESTAURANTE', patterns: [/restaurante/i, /bar /i, /cafeter/i, /burger/i, /sushi/i] },
  { category: 'TRANSPORTE', patterns: [/uber/i, /cabify/i, /metro/i, /bus/i, /taxi/i, /renfe/i] },
  { category: 'SUSCRIPCION', patterns: [/netflix/i, /spotify/i, /amazon prime/i, /icloud/i, /youtube/i] },
  { category: 'ALQUILER', patterns: [/alquiler/i, /rent/i] },
  { category: 'SERVICIOS', patterns: [/luz/i, /agua/i, /electricidad/i, /gas/i, /internet/i, /movil/i] },
  { category: 'SALUD', patterns: [/farmacia/i, /dent/i, /clinic/i, /medic/i] },
];

function keywordCategory(normDesc: string): { category: string; confidence: number } | null {
  for (const row of KEYWORDS) {
    if (row.patterns.some(r => r.test(normDesc))) {
      return { category: row.category, confidence: 0.5 };
    }
  }
  return null;
}

export const categorySuggesterTool = createTool({
  id: 'category-suggester',
  description: 'Suggests a spending category combining memory lookup (hash + secondary key) with keyword heuristics',
  inputSchema: z.object({
    userId: z.string().min(1),
    hash: z.string().min(1),
    normalizedDescription: z.string().min(1),
    amount: z.number().optional(),
    payee: z.string().optional()
  }),
  outputSchema: z.object({
    userId: z.string(),
    hash: z.string(),
    suggestedCategory: z.string(),
    confidence: z.number().min(0).max(1),
    source: z.enum(['memory', 'memory-secondary', 'keyword', 'fallback'])
  }),
  execute: async ({ context }) => {
    const { userId, hash, normalizedDescription, amount, payee } = context;
    const memory = loadMemory(userId);

    const bucket = typeof amount === 'number' ? Math.round(amount) : null;
    const secondaryKey = bucket !== null ? `${normalizedDescription}::${bucket}` : null;

    if (memory && memory.categoryMap[hash]) {
      return {
        userId,
        hash,
        suggestedCategory: memory.categoryMap[hash],
        confidence: 1,
        source: 'memory' as const
      };
    }

    if (memory && secondaryKey && memory.categoryMap[secondaryKey]) {
      return {
        userId,
        hash,
        suggestedCategory: memory.categoryMap[secondaryKey],
        confidence: 0.85,
        source: 'memory-secondary' as const
      };
    }

    const keyword = keywordCategory(normalizedDescription);
    if (keyword) {
      return {
        userId,
        hash,
        suggestedCategory: keyword.category,
        confidence: keyword.confidence,
        source: 'keyword' as const
      };
    }

    if (payee) {
      return {
        userId,
        hash,
        suggestedCategory: 'OTROS',
        confidence: 0.3,
        source: 'fallback' as const
      };
    }

    return {
      userId,
      hash,
      suggestedCategory: 'SIN_CLASIFICAR',
      confidence: 0.1,
      source: 'fallback' as const
    };
  }
});
