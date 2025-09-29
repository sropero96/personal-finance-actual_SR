import 'dotenv/config';
import { mastra } from '../src/mastra';
import * as fs from 'fs';
import * as path from 'path';

// Generates a JSON fixture by passing a PDF through pdf-extractor-agent.
// Usage: npm run fixtures:extract -- <absolute_or_relative_pdf_path> <output_json_path>

async function main() {
  const [, , pdfPathArg, outPathArg] = process.argv;
  if (!pdfPathArg || !outPathArg) {
    console.error('Usage: fixtures:extract <pdfPath> <outputJsonPath>');
    process.exit(1);
  }
  const pdfPath = path.resolve(pdfPathArg);
  const outPath = path.resolve(outPathArg);
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found:', pdfPath);
    process.exit(1);
  }

  const agent = mastra.getAgent('pdfExtractorAgent');
  if (!agent) {
    console.error('pdfExtractorAgent not registered');
    process.exit(1);
  }

  // Read and base64 encode
  const buf = fs.readFileSync(pdfPath);
  const base64 = buf.toString('base64');

  const prompt = `Procesa este extracto bancario. Primero guarda el archivo (save-file) luego lee (pdf-reader) y parsea transacciones. Devuelve JSON puro solo con: { bankName, totalTransactions, transactions } sin texto adicional. Base64: ${base64.substring(0, 200)}... (archivo completo ya provisto en el save-file step).`; // We provide partial preview; tool must save full.

  const response = await agent.generate([{ role: 'user', content: prompt }]);
  let json: any = null;
  try {
    json = JSON.parse(response.text.trim());
  } catch (e) {
    console.error('Failed to parse JSON from agent response. Raw output saved alongside.');
    fs.writeFileSync(outPath + '.raw.txt', response.text, 'utf-8');
    process.exit(1);
  }

  fs.writeFileSync(outPath, JSON.stringify(json, null, 2), 'utf-8');
  console.log('Fixture written:', outPath, 'Transactions:', json.transactions?.length);
}

main().catch(e => { console.error(e); process.exit(1); });
