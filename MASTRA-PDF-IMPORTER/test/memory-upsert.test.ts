import { describe, it, expect } from 'vitest';
import { userMemoryGetTool } from '../src/mastra/tools/memory/user-memory-get';
import { userMemoryUpsertTool } from '../src/mastra/tools/memory/user-memory-upsert';
import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.resolve(process.cwd(), 'data', 'memory');

async function exec(tool: any, input: any) {
  return await tool.execute({ context: input } as any);
}

describe('user-memory upsert', () => {
  const userId = 'test-mem-user';
  const txHash = 'abc123hashdemo';
  const file = path.join(MEMORY_DIR, `${userId}.json`);

  it('crea memoria nueva y aplica corrección', async () => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const before = await exec(userMemoryGetTool, { userId });
    expect(before.exists).toBe(false);
    const up = await exec(userMemoryUpsertTool, { userId, txHash, newPayee: 'CAFETERIA' });
    expect(up.updated).toBe(true);
    const after = await exec(userMemoryGetTool, { userId });
    expect(after.exists).toBe(true);
    expect(after.memory.payeeMap[txHash]).toBe('CAFETERIA');
  });
});
