import express from 'express';
// Polyfill fetch for Node if not available
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
// Forward requests to Mastra CLI HTTP API
// No direct Mastra import to avoid compile errors

const app = express();
app.use(bodyParser.json({ limit: '20mb' }));

app.post('/extract', async (req, res) => {
  // Base URL for Mastra sidecar API (no trailing slash)
  const MASTRA_API_URL = (process.env.MASTRA_API_URL || 'http://localhost:4111').replace(/\/$/, '');
  try {
    const { pdfBase64 } = req.body;
    console.log('[/extract] received payload:', { pdfBase64: pdfBase64?.slice(0, 20) + '...' });
    console.log('[/extract] received pdfBase64 length:', pdfBase64?.length);

    // Use generate endpoint for PDF extractor agent
    const mastraUrl = `${MASTRA_API_URL}/api/agents/pdfExtractorAgent/generate`;
    console.log('[/extract] calling Mastra URL:', mastraUrl);

    // Invoke the PDF extractor agent via Swagger route POST /api/agents/{agentId}/generate
    const apiRes = await fetch(mastraUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: pdfBase64 }]
      })
    });

    console.log('[/extract] fetch completed with status:', apiRes.status);

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[extract] Mastra error status:', apiRes.status, 'body:', errText);
      throw new Error(`Mastra API error: ${apiRes.status}`);
    }

    const apiJson: any = await apiRes.json();
    console.log('[extract] Mastra response JSON keys:', Object.keys(apiJson));

    // Try different response formats
    let text = '';
    if (apiJson.text) {
      text = apiJson.text;
    } else if (apiJson.outputText) {
      text = apiJson.outputText;
    } else if (typeof apiJson === 'string') {
      text = apiJson;
    } else {
      console.log('[/extract] full response:', JSON.stringify(apiJson, null, 2));
      text = JSON.stringify(apiJson);
    }

    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
      const transactions = JSON.parse(text);
      res.json({ transactions });
    } catch (parseErr) {
      console.error('[/extract] JSON parse error:', parseErr);
      res.json({ transactions: [], rawResponse: text });
    }
  } catch (err) {
    console.error('Error in /extract wrapper:', err);
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PDF_AGENT_PORT || 5055;
app.listen(PORT, () => console.log(`PDF agent HTTP wrapper listening on ${PORT}`));
