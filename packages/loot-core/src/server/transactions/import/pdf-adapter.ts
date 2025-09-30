// @ts-strict-ignore
// Thin adapter to integrate the Mastra PDF extraction agent with the existing
// transaction import pipeline. This intentionally stays minimal for Phase 1.
//
// Responsibilities:
// 1. Read the PDF file from disk
// 2. (Future) Encode to base64 and invoke the pdfExtractorAgent (running in the
//    sidecar/workspace package) through an IPC/HTTP bridge or direct import when available
// 3. Map extracted transaction-like objects into the core ParseFileResult shape
// 4. Provide conservative error handling so the UI surfaces a single error entry
//
// NOTE: At this stage we stub the agent invocation so integration can proceed
// incrementally. Replace the stub in `invokePdfAgent` with a real call once the
// runtime bridge is decided (e.g. importing the agent package or calling an API).

import * as fs from '../../../platform/server/fs';
import { logger } from '../../../platform/server/log';
// Log configuration for debugging PDF agent invocation
logger.info('PDF Adapter env PDF_AGENT_HTTP_URL:', process.env.PDF_AGENT_HTTP_URL);

import type { ParseFileResult } from './parse-file';

// Shape expected from the agent (minimal subset we map). This mirrors what the
// agent prompt will guarantee when implemented.
type AgentExtractedTransaction = {
  date: string;            // YYYY-MM-DD
  amount: number;          // signed decimal number
  description?: string;    // raw description/payee text
  balance?: number | null; // optional running balance
};

async function invokePdfAgent(_filePath: string, base64: string): Promise<AgentExtractedTransaction[]> {
  // Debug: log endpoint before invocation
  const endpoint = process.env.PDF_AGENT_HTTP_URL;
  logger.info('invokePdfAgent endpoint:', endpoint);
  if (process.env?.ACTUAL_PDF_AGENT_DISABLED === '1') {
    logger.info('PDF agent disabled via ACTUAL_PDF_AGENT_DISABLED');
    return [];
  }
  if (!endpoint) {
    logger.error('PDF agent HTTP URL not configured');
    throw new Error('PDF_AGENT_HTTP_URL not configured');
  }
  try {
    const res = await fetch(endpoint + '/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64: base64 }),
    });
    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    const data = await res.json();
    const arr = Array.isArray(data.transactions) ? data.transactions : [];
    return arr
      .filter(x => x && typeof x === 'object')
      .map(x => ({
        date: x.date,
        amount: typeof x.amount === 'number' ? x.amount : Number(x.amount),
        description: x.description || x.payee || x.memo || null,
        balance: x.balance != null ? Number(x.balance) : null,
      }))
      .filter(t => t.date && !Number.isNaN(t.amount));
  } catch (err) {
    logger.error('PDF agent HTTP invocation failed', err);
    throw err;
  }
}

export async function parsePDF(filepath: string): Promise<ParseFileResult> {
  const errors: { message: string; internal: string }[] = [];
  let fileBuffer: string;
  try {
    const raw = await fs.readFile(filepath, 'binary');
    // Some platform fs adapters here return a Buffer for 'binary', normalize
    // to base64 string expected by agent.
    // If raw is already a string, create Buffer for encoding.
    // @ts-ignore legacy typing in platform fs
    const buf: Buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'binary');
    fileBuffer = buf.toString('base64');
  } catch (err) {
    errors.push({ message: 'Failed reading PDF file', internal: String(err) });
    return { errors, transactions: [] };
  }

  let extracted: AgentExtractedTransaction[] = [];
  try {
    extracted = await invokePdfAgent(filepath, fileBuffer);
  } catch (err) {
    logger.error('PDF agent invocation failed', err);
    errors.push({ message: 'PDF extraction failed', internal: String(err) });
    return { errors, transactions: [] };
  }

  // Map to core transaction shape. We keep `description` in both payee fields so
  // the user can edit normally in the import preview.
  const transactions = extracted
    .filter(t => t.date && typeof t.amount === 'number' && !Number.isNaN(t.amount))
    .map(t => ({
      amount: t.amount,
      date: t.date,
      payee_name: t.description || null,
      imported_payee: t.description || null,
      notes: null,
    }));

  return { errors, transactions };
}
