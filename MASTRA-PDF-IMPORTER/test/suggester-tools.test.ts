import { describe, it, expect } from 'vitest';
import { payeeSuggesterTool } from '../src/mastra/tools/payee-suggester';
import { categorySuggesterTool } from '../src/mastra/tools/category-suggester';
import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.resolve(process.cwd(), 'data', 'memory');
const userId = 'test-user';
const memoryFile = path.join(MEMORY_DIR, `${userId}.json`);

function writeMemory(payload: any) {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(memoryFile, JSON.stringify(payload, null, 2), 'utf-8');
}

async function run(tool: any, input: any) {
  return await tool.execute({ context: input } as any);
}

describe('payee & category suggester', () => {
  it('usa memoria cuando existe mapping', async () => {
    writeMemory({ payeeMap: { h1: 'MERCADONA' }, categoryMap: { h1: 'SUPERMERCADO' }, corrections: [], historyVersion: 1 });
    const payee = await run(payeeSuggesterTool, { userId, hash: 'h1', normalizedDescription: 'mercadona compra tarjeta', amount: -23.1 });
    expect(payee.source).toBe('memory');
    expect(payee.suggestedPayee).toBe('MERCADONA');
    const category = await run(categorySuggesterTool, { userId, hash: 'h1', normalizedDescription: 'mercadona compra tarjeta', amount: -23.1, payee: payee.suggestedPayee });
    expect(category.source).toBe('memory');
    expect(category.suggestedCategory).toBe('SUPERMERCADO');
  });

  it('cae en heurística/keyword si no hay memoria', async () => {
    writeMemory({ payeeMap: {}, categoryMap: {}, corrections: [], historyVersion: 1 });
    const payee = await run(payeeSuggesterTool, { userId, hash: 'h2', normalizedDescription: 'uber trip barcelona', amount: -12.4 });
    expect(payee.source).not.toBe('memory');
    const category = await run(categorySuggesterTool, { userId, hash: 'h2', normalizedDescription: 'uber trip barcelona', amount: -12.4, payee: payee.suggestedPayee });
    expect(['keyword', 'fallback']).toContain(category.source);
  });
  
  it('usa clave secundaria descripcion+bucket amount para payee', async () => {
    const userId = 'user-secondary';
    const memoryFile = path.join(MEMORY_DIR, `${userId}.json`);
    if (fs.existsSync(memoryFile)) fs.unlinkSync(memoryFile);
    const secondaryKey = 'mercadona compra tarjeta::-23';
    fs.writeFileSync(memoryFile, JSON.stringify({ payeeMap: { [secondaryKey]: 'MERCADONA SA' }, categoryMap: {}, corrections: [], historyVersion: 1 }, null, 2));
    const res = await run(payeeSuggesterTool, { userId, hash: 'otrohash', normalizedDescription: 'mercadona compra tarjeta', amount: -23.4 });
    expect(res.source).toBe('memory');
    expect(res.suggestedPayee).toBe('MERCADONA SA');
    expect(res.confidence).toBeGreaterThan(0.8);
  });

  it('usa clave secundaria descripcion+bucket amount para categoria', async () => {
    const userId = 'user-cat-secondary';
    const memoryFile = path.join(MEMORY_DIR, `${userId}.json`);
    if (fs.existsSync(memoryFile)) fs.unlinkSync(memoryFile);
    const secondaryKey = 'uber trip barcelona::-12';
    fs.writeFileSync(memoryFile, JSON.stringify({ payeeMap: {}, categoryMap: { [secondaryKey]: 'TRANSPORTE' }, corrections: [], historyVersion: 1 }, null, 2));
    const category = await run(categorySuggesterTool, { userId, hash: 'xhash', normalizedDescription: 'uber trip barcelona', amount: -12.2 });
    expect(category.source).toBe('memory-secondary');
    expect(category.suggestedCategory).toBe('TRANSPORTE');
    expect(category.confidence).toBeGreaterThan(0.8);
  });
});
