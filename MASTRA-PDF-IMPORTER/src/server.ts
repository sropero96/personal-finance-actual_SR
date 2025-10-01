import 'dotenv/config';
import express from 'express';
// Polyfill fetch for Node if not available
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
// Forward requests to Mastra CLI HTTP API
// No direct Mastra import to avoid compile errors

const app = express();

// Enable CORS for browser requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use(bodyParser.json({ limit: '20mb' }));

app.post('/extract', async (req, res) => {
  // Base URL for Mastra sidecar API (no trailing slash)
  const MASTRA_API_URL = (process.env.MASTRA_API_URL || 'http://localhost:4112').replace(/\/$/, '');

  try {
    const { pdfBase64 } = req.body;
    console.log('[/extract] received payload:', { pdfBase64: pdfBase64?.slice(0, 20) + '...' });
    console.log('[/extract] received pdfBase64 length:', pdfBase64?.length);

    // Clean base64 data (remove data URL prefix if present)
    let cleanBase64 = pdfBase64;
    if (pdfBase64.includes(',')) {
      cleanBase64 = pdfBase64.split(',')[1];
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(cleanBase64, 'base64');
    console.log('[/extract] converted to buffer, size:', buffer.length);

    // Extract text from PDF directly using dynamic import
    console.log('[/extract] extracting text from PDF...');
    // @ts-ignore - pdf-parse doesn't have proper TypeScript declarations
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(buffer);
    const pdfText = pdfData.text;
    console.log('[/extract] extracted text length:', pdfText.length);
    console.log('[/extract] PDF pages:', pdfData.numpages);

    // Use generate endpoint for PDF extractor agent
    const mastraUrl = `${MASTRA_API_URL}/api/agents/pdfExtractorAgent/generate`;
    console.log('[/extract] calling Mastra URL:', mastraUrl);

    // Invoke the PDF extractor agent via Swagger route POST /api/agents/{agentId}/generate
    // Send the extracted text directly
    const apiRes = await fetch(mastraUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: `Extract bank transactions from this PDF text:\n\n${pdfText}`
        }]
      }),
      // Increase timeout to 5 minutes for large PDFs
      signal: AbortSignal.timeout(300000)
    });

    console.log('[/extract] fetch completed with status:', apiRes.status);

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[extract] Mastra error status:', apiRes.status, 'body:', errText);
      throw new Error(`Mastra API error: ${apiRes.status}`);
    }

    const apiJson: any = await apiRes.json();
    console.log('[extract] Mastra response JSON keys:', Object.keys(apiJson));
    console.log('[extract] Mastra response text field:', apiJson.text?.substring(0, 200));
    console.log('[extract] Tool calls made:', apiJson.toolCalls?.length || 0);
    console.log('[extract] Tool results:', apiJson.toolResults?.length || 0);
    if (apiJson.toolCalls && apiJson.toolCalls.length > 0) {
      console.log('[extract] Tool names called:', apiJson.toolCalls.map((tc: any) => tc.toolName));
    }

    // Extract text from various possible response formats
    let text = '';
    if (apiJson.text) {
      text = apiJson.text;
    } else if (apiJson.outputText) {
      text = apiJson.outputText;
    } else if (apiJson.content) {
      text = apiJson.content;
    } else if (typeof apiJson === 'string') {
      text = apiJson;
    } else {
      console.log('[/extract] full response:', JSON.stringify(apiJson, null, 2));
      text = JSON.stringify(apiJson);
    }

    // Clean up markdown code blocks and extra whitespace
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(text);

      // Handle different response structures from the parser tools
      // The parser tools return: { bankName, accountNumber, transactions: [...], totalTransactions, success }
      // We need to extract just the transactions array
      if (parsed.transactions && Array.isArray(parsed.transactions)) {
        // Map from parser format to pdf-adapter expected format
        const transactions = parsed.transactions.map((t: any) => ({
          date: t.date,
          amount: t.amount,
          description: t.description,
          balance: t.balance
        }));
        res.json({ transactions });
      } else if (Array.isArray(parsed)) {
        // If it's already an array, assume it's transactions
        res.json({ transactions: parsed });
      } else {
        console.error('[/extract] Unexpected response format:', parsed);
        res.json({ transactions: [], rawResponse: text });
      }
    } catch (parseErr) {
      console.error('[/extract] JSON parse error:', parseErr);
      console.error('[/extract] Raw text:', text.substring(0, 500));
      res.json({ transactions: [], rawResponse: text });
    }
  } catch (err) {
    console.error('Error in /extract wrapper:', err);
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PDF_AGENT_PORT || 5055;
app.listen(PORT, () => console.log(`PDF agent HTTP wrapper listening on ${PORT}`));
