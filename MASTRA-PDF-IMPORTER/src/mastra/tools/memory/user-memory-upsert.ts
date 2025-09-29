import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.resolve(process.cwd(), 'data', 'memory');

interface UserMemory {
  payeeMap: Record<string, string>;
  categoryMap: Record<string, string>;
  corrections: Array<{ txHash: string; newPayee?: string; newCategory?: string; timestamp: number }>;
  historyVersion: number;
}

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function loadMemory(userId: string): UserMemory {
  ensureDir();
  const file = path.join(MEMORY_DIR, `${userId}.json`);
  if (!fs.existsSync(file)) {
    return { payeeMap: {}, categoryMap: {}, corrections: [], historyVersion: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as UserMemory;
  } catch {
    return { payeeMap: {}, categoryMap: {}, corrections: [], historyVersion: 1 };
  }
}

function saveMemory(userId: string, data: UserMemory) {
  ensureDir();
  fs.writeFileSync(path.join(MEMORY_DIR, `${userId}.json`), JSON.stringify(data, null, 2), 'utf-8');
}

export const userMemoryUpsertTool = createTool({
  id: 'user-memory-upsert',
  description: 'Applies a feedback correction (payee/category) for a transaction hash and updates memory maps',
  inputSchema: z.object({
    userId: z.string(),
    txHash: z.string(),
    newPayee: z.string().optional(),
    newCategory: z.string().optional()
  }).refine(i => i.newPayee || i.newCategory, { message: 'At least one of newPayee or newCategory required' }),
  outputSchema: z.object({
    userId: z.string(),
    updated: z.boolean(),
    payeeApplied: z.boolean(),
    categoryApplied: z.boolean(),
    totalCorrections: z.number()
  }),
  execute: async ({ context }) => {
    const { userId, txHash, newPayee, newCategory } = context;
    const memory = loadMemory(userId);
    let payeeApplied = false;
    let categoryApplied = false;

    if (newPayee) {
      memory.payeeMap[txHash] = newPayee; // For simple MVP we map hash→payee; later rawKey→payee
      payeeApplied = true;
    }
    if (newCategory) {
      memory.categoryMap[txHash] = newCategory; // Same simplification as above
      categoryApplied = true;
    }

    memory.corrections.push({ txHash, newPayee, newCategory, timestamp: Date.now() });
    saveMemory(userId, memory);

    return {
      userId,
      updated: true,
      payeeApplied,
      categoryApplied,
      totalCorrections: memory.corrections.length
    };
  }
});
