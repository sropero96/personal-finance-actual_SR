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
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function defaultMemory(): UserMemory {
  return { payeeMap: {}, categoryMap: {}, corrections: [], historyVersion: 1 };
}

export const userMemoryGetTool = createTool({
  id: 'user-memory-get',
  description: 'Loads user-specific curation memory (payee/category mappings and corrections)',
  inputSchema: z.object({
    userId: z.string().min(1, 'userId required')
  }),
  outputSchema: z.object({
    userId: z.string(),
    exists: z.boolean(),
    memory: z.object({
      payeeMap: z.record(z.string()).describe('Raw key → Canonical Payee'),
      categoryMap: z.record(z.string()).describe('rawKey|canonicalPayee → Category'),
      corrections: z.array(z.object({
        txHash: z.string(),
        newPayee: z.string().optional(),
        newCategory: z.string().optional(),
        timestamp: z.number()
      })),
      historyVersion: z.number()
    })
  }),
  execute: async ({ context }) => {
    const { userId } = context;
    ensureDir();
    const filePath = path.join(MEMORY_DIR, `${userId}.json`);
    if (!fs.existsSync(filePath)) {
      return { userId, exists: false, memory: defaultMemory() };
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { userId, exists: true, memory: { ...defaultMemory(), ...parsed } };
    } catch (e) {
      return { userId, exists: false, memory: defaultMemory() };
    }
  }
});
