import 'dotenv/config';
import { mastra } from '../src/mastra';

// Minimal demo runner: simulates output from extractor agent (subset) and feeds curator.
// Keeping logic tiny & reviewable.

interface RawTxInput {
  date: string; // could be DD/MM/YYYY or ISO
  description: string;
  amount: string | number;
}

const userId = 'demo-user';

// Example raw transactions (simulate Santander + generic)
const raw: RawTxInput[] = [
  { date: '26/08/2025', description: 'MERCADONA COMPRA TARJETA 123456 REFERENCIA 998877', amount: '-23,10' },
  { date: '2025-08-26', description: 'UBER *TRIP 998877 BARCELONA', amount: '-12,50' },
  { date: '27/08/2025', description: 'NETFLIX.COM SUSCRIPCION', amount: '-15,99' },
  { date: '27/08/2025', description: 'MERCADONA COMPRA TARJETA 123456 REFERENCIA 112233', amount: '-23,10' }, // duplicate candidate
];

async function main() {
  const agent = mastra.getAgent('dataCuratorAgent') || mastra.getAgent('data-curator-agent');
  if (!agent) {
    console.error('Data Curator Agent not registered.');
    process.exit(1);
  }

  // Provide instructions & raw transactions in user message; agent will call tools.
  const prompt = `Curar las siguientes transacciones para userId=${userId}. Devuelve JSON estructurado.\n` +
    JSON.stringify({ userId, transactions: raw, previous: raw.slice(0, 2) }, null, 2);

  const response = await agent.generate([{ role: 'user', content: prompt }]);

  console.log('\n--- TEXT RESPONSE ---');
  console.log(response.text);

  if (response.object) {
    console.log('\n--- OBJECT ---');
    console.dir(response.object, { depth: 5 });
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
