import { mastra } from '../src/mastra';
import * as dotenv from 'dotenv';
import { normalizeTransactionTool } from '../src/mastra/tools/normalize-transaction';
import { payeeSuggesterTool } from '../src/mastra/tools/payee-suggester';
import { categorySuggesterTool } from '../src/mastra/tools/category-suggester';
import { duplicateDetectorTool } from '../src/mastra/tools/duplicate-detector';
import { scoringTool } from '../src/mastra/tools/scoring-tool';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Cargar .env del paquete (no del monorepo root) para asegurar OPENAI_API_KEY
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function runLocalPipeline(userId: string, raw: any[]) {
    const enriched: any[] = [];
    for (const tx of raw) {
      try {
        const norm = await normalizeTransactionTool.execute({ context: { date: tx.date, description: tx.description, amount: tx.amount } } as any);
        const payee = await payeeSuggesterTool.execute({ context: { userId, hash: norm.hash, normalizedDescription: norm.normalizedDescription, amount: norm.amount } } as any);
        const category = await categorySuggesterTool.execute({ context: { userId, hash: norm.hash, normalizedDescription: norm.normalizedDescription, amount: norm.amount, payee: payee.suggestedPayee } } as any);
    const duplicate = await duplicateDetectorTool.execute({ context: { newTx: { hash: norm.hash, date: norm.date, amount: norm.amount, normalizedDescription: norm.normalizedDescription }, previous: enriched.map(e => ({ hash: e.normalized.hash, date: e.normalized.date, amount: e.normalized.amount, normalizedDescription: e.normalized.normalizedDescription })) } } as any);
    const score = await scoringTool.execute({ context: { payeeConfidence: payee.confidence, categoryConfidence: category.confidence, duplicateConfidence: duplicate.isDuplicate ? duplicate.confidence : 0 } } as any);
        enriched.push({
          raw: tx,
          normalized: norm,
          payee: { value: payee.suggestedPayee, confidence: payee.confidence, source: payee.source },
          category: { value: category.suggestedCategory, confidence: category.confidence, source: category.source },
          duplicate: { ...duplicate },
          score: score,
          issues: []
        });
      } catch (e) {
        enriched.push({ raw: tx, error: (e as Error).message, issues: ['normalization_failure'] });
      }
    }
    const metrics = {
      total: enriched.length,
      normalized: enriched.filter(e => e.normalized).length,
      withPayeeSuggestion: enriched.filter(e => e.payee && e.payee.value && e.payee.value !== 'UNKNOWN').length,
      withCategorySuggestion: enriched.filter(e => e.category && e.category.value && e.category.value !== 'SIN_CLASIFICAR').length,
      duplicates: enriched.filter(e => e.duplicate && e.duplicate.isDuplicate).length,
      fromMemoryPayee: enriched.filter(e => e.payee?.source === 'memory').length,
      fromMemoryCategory: enriched.filter(e => e.category?.source === 'memory').length,
      avgScore: Number((enriched.filter(e => e.score).reduce((a, b) => a + (b.score.value || 0), 0) / Math.max(1, enriched.filter(e => e.score).length)).toFixed(4))
    };
    return { userId, total: metrics.total, metrics, enriched };
  }

async function main() {
  const userId = process.argv[2] || 'demo-user';
  const mockPath = path.resolve(__dirname, 'mock-pdf-data.json');
  const raw = JSON.parse(fs.readFileSync(mockPath, 'utf-8'));

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[WARN] OPENAI_API_KEY no definido. Usando pipeline determinista local.');
    const local = await runLocalPipeline(userId, raw);
    console.log(JSON.stringify(local, null, 2));
    return;
  }
  else {
    console.log('[INFO] Usando OPENAI_API_KEY (oculto) para ejecutar agente con LLM...');
  }

  const prompt = `Procesa este lote de transacciones. Devuelve JSON estructurado según el formato especificado.\nuserId=${userId}\nTRANSACTIONS:\n${JSON.stringify(raw, null, 2)}\n`;
  // Fallback: try respond/run naming (depends on Agent API). Prefer respond.
  const agent = mastra.getAgent('dataCuratorAgent');
  if (!agent) throw new Error('Agente data-curator no registrado');
  const response = await (agent as any).generate([{ role: 'user', content: prompt }]);
  console.log(response.text || JSON.stringify(response, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
