import 'dotenv/config';
import { mastra } from '../src/mastra';
import * as fs from 'fs';
import * as path from 'path';

// Minimal feedback simulation: takes a stored memory file (if any), applies a correction, re-runs a single tx enrichment.

const userId = 'demo-user';
const memoryPath = path.resolve(process.cwd(), 'data', 'memory', `${userId}.json`);

async function run() {
  const curator = mastra.getAgent('dataCuratorAgent');
  if (!curator) {
    console.error('Curator agent not found');
    process.exit(1);
  }

  // Single raw transaction as example
  const rawTx = { date: '27/08/2025', description: 'MERCADONA COMPRA TARJETA 123456', amount: '-23,10' };

  console.log('Primera pasada (sin corrección)...');
  const first = await curator.generate([{ role: 'user', content: `Curar transacción para userId=${userId} JSON:\n${JSON.stringify({ userId, transactions: [rawTx] })}` }]);
  console.log(first.text);

  // Extract hash naive (not parsing JSON object; relying on text output containing hash). For simplicity, ask agent for hash only.
  const hashResp = await curator.generate([{ role: 'user', content: `Solo dame el hash (campo normalized.hash) de esta transacción en texto plano:\n${JSON.stringify({ userId, transactions: [rawTx] })}` }]);
  const hash = (hashResp.text.match(/[a-f0-9]{24}/) || [])[0];
  if (!hash) {
    console.error('No hash detectado; abortando.');
    process.exit(1);
  }
  console.log('Hash detectado:', hash);

  console.log('Aplicando corrección de categoría -> SUPERMERCADO...');
  const upsertTool = mastra.getAgent('dataCuratorAgent')?.tools?.userMemoryUpsertTool || undefined;
  // Prefer tool invocation via agent message to stay consistent:
  await curator.generate([{ role: 'user', content: `Aplica corrección: categoría=SUPERMERCADO para hash=${hash} userId=${userId}. Usa user-memory-upsert.` }]);

  console.log('Segunda pasada (debe reflejar memoria)...');
  const second = await curator.generate([{ role: 'user', content: `Curar transacción para userId=${userId} JSON:\n${JSON.stringify({ userId, transactions: [rawTx] })}` }]);
  console.log(second.text);

  if (fs.existsSync(memoryPath)) {
    console.log('\nContenido memoria actualizado:');
    console.log(fs.readFileSync(memoryPath, 'utf-8'));
  }
}

run().catch(e => { console.error(e); process.exit(1); });
