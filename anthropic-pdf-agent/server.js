/**
 * ANTHROPIC AGENT SERVER
 *
 * Agent-based PDF Processing for Bank Statements
 * Architecture based on: https://www.anthropic.com/engineering/building-effective-agents
 *
 * Flow:
 * 1. Actual Budget uploads PDF → POST /api/process-pdf
 * 2. Agent reads PDF and extracts transactions using tools
 * 3. Agent curates Payee names and suggests Categories
 * 4. Returns structured JSON to Actual Budget
 */

const path = require('path');

// Load environment variables from multiple sources
require('dotenv').config({ path: path.join(__dirname, '.env') }); // Local .env
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Root .env

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;

console.log('🤖 Anthropic Agent Server starting...');

// ============================================
// CONFIGURATION VALIDATION (Fail-fast)
// ============================================
const REQUIRED_CONFIG = {
  VITE_ANTHROPIC_API_KEY: process.env.VITE_ANTHROPIC_API_KEY,
};

const missingConfig = Object.entries(REQUIRED_CONFIG)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingConfig.length > 0) {
  console.error('\n❌ CONFIGURATION ERROR: Missing required environment variables:\n');
  missingConfig.forEach(key => console.error(`   - ${key}`));
  console.error('\n📝 To fix this:');
  console.error('   1. Copy .env.example to .env in the anthropic-pdf-agent/ directory');
  console.error('   2. Add your Anthropic API key: VITE_ANTHROPIC_API_KEY=sk-ant-...');
  console.error('   3. Get your API key from: https://console.anthropic.com/settings/keys\n');
  console.error('💡 For production (Fly.io), set secrets with: fly secrets set VITE_ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

// Validate API key format
if (!REQUIRED_CONFIG.VITE_ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
  console.error('\n❌ CONFIGURATION ERROR: Invalid Anthropic API key format');
  console.error('   Expected format: sk-ant-...');
  console.error('   Get a valid key from: https://console.anthropic.com/settings/keys\n');
  process.exit(1);
}

console.log('✅ Configuration validated');
console.log(`📡 API Key: ${REQUIRED_CONFIG.VITE_ANTHROPIC_API_KEY.substring(0, 15)}...`);

// ============================================
// SERVER INITIALIZATION
// ============================================

const app = express();
const PORT = 4000;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Anthropic client (safe now, config is validated)
const anthropic = new Anthropic({
  apiKey: REQUIRED_CONFIG.VITE_ANTHROPIC_API_KEY,
});

/**
 * Agent Tool: Read PDF and extract text
 */
function createPDFReaderTool() {
  return {
    name: 'read_pdf',
    description: 'Reads a PDF file and extracts all text content from all pages',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the PDF file to read'
        }
      },
      required: ['file_path']
    }
  };
}

/**
 * Agent Tool: Extract transactions from text
 */
function createTransactionExtractorTool() {
  return {
    name: 'extract_transactions',
    description: 'Extracts bank transactions from statement text',
    input_schema: {
      type: 'object',
      properties: {
        statement_text: {
          type: 'string',
          description: 'Raw text from bank statement'
        },
        bank_type: {
          type: 'string',
          enum: ['santander', 'revolut'],
          description: 'Type of bank for format-specific extraction'
        }
      },
      required: ['statement_text', 'bank_type']
    }
  };
}

/**
 * Agent Tool: Curate payee name
 */
function createPayeeCuratorTool() {
  return {
    name: 'curate_payee',
    description: 'Cleans and curates payee names by removing prefixes and extracting merchant/location',
    input_schema: {
      type: 'object',
      properties: {
        raw_description: {
          type: 'string',
          description: 'Raw transaction description from bank'
        }
      },
      required: ['raw_description']
    }
  };
}

/**
 * Execute tool based on agent's request
 */
async function executeTool(toolName, toolInput, pdfBase64) {
  console.log(`🔧 [Agent Tool] Executing: ${toolName}`);
  console.log(`📥 [Agent Tool] Input:`, JSON.stringify(toolInput).substring(0, 200));

  switch (toolName) {
    case 'read_pdf':
      // In a real implementation, you'd use a PDF library here
      // For now, we'll send the PDF directly to Claude in the initial message
      return {
        success: true,
        message: 'PDF content is included in the document attachment'
      };

    case 'extract_transactions':
      return {
        success: true,
        message: 'Transactions extracted successfully'
      };

    case 'curate_payee':
      const { raw_description } = toolInput;
      // Simple curation logic (agent will do the real work)
      const curated = raw_description
        .replace(/^Fecha valor:?\s*/i, '')
        .replace(/^Pago Movil En\s*/i, '')
        .replace(/^Compra\s*/i, '')
        .replace(/,?\s*Tarj\.\s*:\*\d+$/i, '')
        .replace(/,?\s*Tarjeta\s*\d+$/i, '')
        .trim();

      return {
        success: true,
        curated_payee: curated
      };

    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      };
  }
}

/**
 * Main endpoint: Process PDF with Anthropic Agent
 */
app.post('/api/process-pdf', upload.single('pdf'), async (req, res) => {
  console.log('\n🚀 [Agent Server] New PDF processing request received');
  console.log(`📄 [Agent Server] File: ${req.file?.originalname} (${req.file?.size} bytes)`);

  try {
    if (!req.file) {
      throw new Error('No PDF file uploaded');
    }

    // Read PDF file as base64
    const pdfBuffer = await fs.readFile(req.file.path);
    const pdfBase64 = pdfBuffer.toString('base64');
    console.log(`📦 [Agent Server] PDF converted to base64: ${pdfBase64.length} chars`);

    // Build comprehensive agent prompt
    const agentPrompt = `You are an expert Spanish bank statement transaction extractor and curator.

I've attached a PDF bank statement from either Santander España or Revolut España.

⚠️ CRITICAL: This PDF may contain 10-100 transactions across multiple pages. You MUST process the ENTIRE document from the first page to the last page without stopping early.

Your task is to:

1. **READ THE PDF DOCUMENT COMPLETELY**
   - Process EVERY SINGLE PAGE from start to finish
   - Do not stop until you reach the end of the document
   - Extract all text from every page
   - Identify which bank this is from (Santander or Revolut)
   - Find the account number if present

2. **EXTRACT ALL TRANSACTIONS**
   - Find EVERY SINGLE transaction in the ENTIRE document
   - Do not stop after the first page or first 20-30 transactions
   - Continue processing until you have extracted ALL transactions from ALL pages
   - For each transaction extract:
     * Date (in YYYY-MM-DD format)
     * Raw description (full text)
     * Amount (negative for expenses, positive for income)

3. **CURATE THE DATA**

   **CRITICAL: Payee Curation** (Most Important!)
   - Extract ONLY the merchant/person name and location
   - Remove prefixes like "Fecha valor:", "Pago Movil En", "Compra", etc.
   - Examples:
     * "Fecha valor: 17/07/2025 Pago Movil En La Mina, Madrid, Tarj. :*536242"
       → Payee: "La Mina, Madrid"
     * "Pago Movil En City Paseo Extr, Madrid"
       → Payee: "City Paseo Extr, Madrid"
     * "Compra Loomisp*campo Del Moro, Madrid, Tarjeta 123"
       → Payee: "Loomisp, Madrid"

   **Notes Field:**
   - Keep FULL original description (without "Fecha valor:" prefix)

4. **RETURN COMPACT JSON**

**CRITICAL:** Use COMPACT JSON format (minimize whitespace) to fit 100+ transactions within token limits.

Return ONLY valid JSON (no markdown, no code blocks):

{"bankName":"Santander España","accountNumber":"ES24...","transactions":[{"date":"2025-07-17","payee":"La Mina, Madrid","notes":"Pago Movil En La Mina, Madrid","amount":-41.80,"confidence":0.95}],"totalTransactionsFound":51,"pagesProcessed":3,"extractionComplete":true,"success":true}

**FORMAT RULES:**
- NO spaces after colons or commas
- NO line breaks
- Keep notes CONCISE but informative
- For 50+ transactions, prioritize completeness over verbose notes

⚠️ BEFORE RETURNING: Verify you processed ALL pages and ALL transactions.

IMPORTANT: Return ONLY the compact JSON object. No explanations, no markdown, no code blocks.`;

    // Call Claude API with streaming for large responses
    console.log('🤖 [Agent] Sending PDF to Claude API with agent prompt (streaming mode)...');

    let responseText = '';
    let stopReason = '';
    let usage = { input_tokens: 0, output_tokens: 0 };

    const stream = await anthropic.messages.stream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192, // Maximum allowed for this model (supports 100+ transactions with compact format)
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: agentPrompt,
          },
        ],
      }],
    });

    // Collect streamed response
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        responseText += chunk.delta.text;
      } else if (chunk.type === 'message_stop') {
        stopReason = 'end_turn';
      } else if (chunk.type === 'message_delta') {
        stopReason = chunk.delta?.stop_reason || stopReason;
        if (chunk.usage) {
          usage.output_tokens = chunk.usage.output_tokens || 0;
        }
      }
    }

    // Get final message for full usage stats
    const finalMessage = await stream.finalMessage();
    if (finalMessage.usage) {
      usage = finalMessage.usage;
    }

    console.log('✅ [Agent] Received response from Claude');
    console.log(`📊 [Agent] Response type: text (streamed)`);
    console.log(`🔢 [Agent] Stop reason: ${stopReason}`);
    console.log(`📊 [Agent] Input tokens: ${usage.input_tokens}`);
    console.log(`📊 [Agent] Output tokens: ${usage.output_tokens}`);

    // Parse agent response
    console.log(`📝 [Agent] Response length: ${responseText.length} chars`);
    console.log(`📄 [Agent] Response preview: ${responseText.substring(0, 200)}...`);

    // Warn if response was truncated
    if (stopReason === 'max_tokens') {
      console.error('❌ [Agent] CRITICAL: Response was TRUNCATED! Hit max_tokens limit (8192)');
      console.error('❌ [Agent] This PDF has TOO MANY transactions for single-pass processing');
      console.error('💡 [Agent] Solution: The response will be incomplete. User should split PDF or reduce transaction count.');
    }

    // Clean and parse JSON
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '');
    }

    const result = JSON.parse(cleanedText);

    console.log(`✨ [Agent] Parsed successfully:`);
    console.log(`   - Bank: ${result.bankName}`);
    console.log(`   - Transactions: ${result.transactions.length}`);
    console.log(`   - Complete: ${result.extractionComplete}`);

    // Cleanup uploaded file
    await fs.unlink(req.file.path);
    console.log('🗑️  [Agent Server] Cleaned up uploaded file');

    // Return JSON response
    res.json(result);
    console.log('✅ [Agent Server] Response sent to client\n');

  } catch (error) {
    console.error('❌ [Agent Server] Error:', error.message);
    console.error('📚 [Agent Server] Stack:', error.stack);

    // Cleanup file if it exists
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    res.status(500).json({
      success: false,
      error: error.message,
      bankName: 'Unknown',
      transactions: [],
      totalTransactionsFound: 0,
      extractionComplete: false,
    });
  }
});

// Health check endpoint
/**
 * ============================================
 * AGENT 2: CATEGORY SUGGESTER
 * ============================================
 * Suggests categories for transactions based on:
 * - User's existing categories
 * - Historical transaction patterns
 * - Active categorization rules
 * - Claude AI inference (when needed)
 */

const { buildCategorizationPrompt } = require('./categorization/prompt');
const { deduplicateAndSort, findMatchingRule, extractKeywords } = require('./categorization/search');

app.post('/api/suggest-categories', express.json(), async (req, res) => {
  const startTime = Date.now();
  console.log('\n🎯 [Agent 2] New categorization request received');

  try {
    const {
      transactions,
      accountId,
      categories,      // NEW: Frontend can send categories directly
      rules,           // NEW: Frontend can send rules directly
      historicalTransactions,  // NEW: Frontend can send historical data
      actualBudgetUrl  // LEGACY: For backwards compatibility
    } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'transactions array is required' });
    }

    console.log(`📊 [Agent 2] Processing ${transactions.length} transactions`);

    // Step 1: Get user context (from request or fetch from server)
    console.log('🔍 [Agent 2] Step 1: Loading user context...');

    let userCategories, activeRules;

    if (categories && rules) {
      // Data provided directly by frontend (PREFERRED)
      userCategories = categories;
      activeRules = rules;
      console.log(`✅ [Agent 2] Using categories and rules from frontend`);
    } else {
      // LEGACY: Fetch from Actual Budget server (requires APIs to exist)
      console.log(`⚠️  [Agent 2] LEGACY MODE: Fetching from server (deprecated)`);

      if (!accountId || !actualBudgetUrl) {
        return res.status(400).json({
          error: 'When not providing categories/rules directly, accountId and actualBudgetUrl are required'
        });
      }

      const baseUrl = actualBudgetUrl;
      const [categoriesRes, rulesRes] = await Promise.all([
        fetch(`${baseUrl}/api/categories/${accountId}`),
        fetch(`${baseUrl}/api/rules/${accountId}`),
      ]);

      if (!categoriesRes.ok || !rulesRes.ok) {
        throw new Error('Failed to fetch user data from Actual Budget');
      }

      const categoriesData = await categoriesRes.json();
      const rulesData = await rulesRes.json();
      userCategories = categoriesData.categories;
      activeRules = rulesData.rules;
    }

    console.log(`✅ [Agent 2] Loaded ${userCategories.length} categories, ${activeRules.length} rules`);

    // Step 2: Group transactions by unique payee
    console.log('🔍 [Agent 2] Step 2: Grouping transactions by payee...');

    const groupedByPayee = {};
    transactions.forEach(tx => {
      const payee = tx.payee_name || tx.payee || 'Unknown';
      if (!groupedByPayee[payee]) {
        groupedByPayee[payee] = [];
      }
      groupedByPayee[payee].push(tx);
    });

    const uniquePayees = Object.keys(groupedByPayee);
    console.log(`✅ [Agent 2] Found ${uniquePayees.length} unique payees`);

    // Step 3: Build payee context from historical data
    console.log('🔍 [Agent 2] Step 3: Building historical context...');

    const payeeContext = {};

    if (historicalTransactions && Array.isArray(historicalTransactions)) {
      // Data provided directly by frontend (PREFERRED)
      console.log(`✅ [Agent 2] Using ${historicalTransactions.length} historical transactions from frontend`);

      // Group historical transactions by payee
      for (const payee of uniquePayees) {
        const payeeLower = payee.toLowerCase();

        // Find all historical transactions for this payee (exact and fuzzy match)
        const matches = historicalTransactions.filter(tx => {
          const historicalPayee = (tx.payeeName || tx.payee || '').toLowerCase();

          // Exact match
          if (historicalPayee === payeeLower) return true;

          // Fuzzy match: check if keywords overlap
          const keywords1 = extractKeywords(payee);
          const keywords2 = extractKeywords(historicalPayee);
          const overlap = keywords1.filter(k => keywords2.includes(k)).length;

          return overlap >= Math.min(keywords1.length, keywords2.length) / 2;
        });

        payeeContext[payee] = deduplicateAndSort(matches);

        if (matches.length > 0) {
          console.log(`  ✅ Found ${matches.length} historical transactions for "${payee}"`);
        }
      }

    } else {
      // LEGACY: Fetch from Actual Budget server (requires APIs to exist)
      console.log(`⚠️  [Agent 2] LEGACY MODE: Fetching historical data from server (deprecated)`);

      if (!accountId || !actualBudgetUrl) {
        console.log(`  ⚠️  Missing accountId or actualBudgetUrl, skipping historical search`);
      } else {
        const baseUrl = actualBudgetUrl;

        for (const payee of uniquePayees) {
          try {
            // Try exact match first
            const exactUrl = `${baseUrl}/api/transactions/search?accountId=${accountId}&payee=${encodeURIComponent(payee)}&limit=20`;
            const exactRes = await fetch(exactUrl);

            if (exactRes.ok) {
              const { transactions: exactMatches } = await exactRes.json();
              if (exactMatches.length >= 5) {
                payeeContext[payee] = deduplicateAndSort(exactMatches);
                console.log(`  ✅ Exact match for "${payee}": ${exactMatches.length} transactions`);
                continue;
              }
            }

            // Fallback to fuzzy search
            const fuzzyUrl = `${baseUrl}/api/transactions/search?accountId=${accountId}&payee=${encodeURIComponent(payee)}&fuzzy=true&limit=20`;
            const fuzzyRes = await fetch(fuzzyUrl);

            if (fuzzyRes.ok) {
              const { transactions: fuzzyMatches } = await fuzzyRes.json();
              payeeContext[payee] = deduplicateAndSort(fuzzyMatches);
              console.log(`  🔍 Fuzzy match for "${payee}": ${fuzzyMatches.length} transactions`);
            } else {
              payeeContext[payee] = [];
              console.log(`  ❌ No matches for "${payee}"`);
            }
          } catch (error) {
            console.error(`  ❌ Error fetching history for "${payee}":`, error.message);
            payeeContext[payee] = [];
          }
        }
      }
    }

    console.log(`✅ [Agent 2] Built context for ${Object.keys(payeeContext).length} payees`);

    // Step 4: Categorize each transaction
    console.log('🔍 [Agent 2] Step 4: Categorizing transactions...');

    const suggestions = [];
    let claudeCallsCount = 0;

    for (const transaction of transactions) {
      const payee = transaction.payee_name || transaction.payee || 'Unknown';
      const historicalData = payeeContext[payee] || [];

      // Check if a rule matches first (highest priority)
      const ruleMatch = findMatchingRule(transaction, activeRules);

      if (ruleMatch.matched) {
        const category = userCategories.find(c => c.id === ruleMatch.categoryId);
        suggestions.push({
          transaction_id: transaction.id,
          category: category?.name || null,
          categoryId: ruleMatch.categoryId,
          confidence: 0.98,
          reasoning: 'Matches active categorization rule',
          source: 'rule',
        });
        console.log(`  🎯 Rule match for "${payee}": ${category?.name}`);
        continue;
      }

      // Auto-categorize if we have strong historical signal
      if (historicalData.length > 0) {
        const topCategory = historicalData[0]; // Already sorted by frequency + recency

        if (topCategory.frequency >= 3) {
          suggestions.push({
            transaction_id: transaction.id,
            category: topCategory.categoryName,
            categoryId: topCategory.category,
            confidence: 0.95,
            reasoning: `Used ${topCategory.frequency} times historically for similar transactions`,
            source: 'history',
          });
          console.log(`  📊 Auto-categorized "${payee}": ${topCategory.categoryName} (freq: ${topCategory.frequency})`);
          continue;
        }
      }

      // Call Claude for uncertain cases
      console.log(`  🤖 Calling Claude for "${payee}"...`);
      claudeCallsCount++;

      const promptResult = buildCategorizationPrompt({
        transaction,
        userCategories,
        activeRules,
        similarTransactions: historicalData.flatMap(h => h.examples || []),
      });

      if (promptResult.skipClaude) {
        suggestions.push({
          transaction_id: transaction.id,
          ...promptResult.result,
          source: 'rule-prompt-check',
        });
        continue;
      }

      try {
        const message = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          temperature: 0,
          messages: [{
            role: 'user',
            content: promptResult.prompt,
          }],
        });

        const responseText = message.content[0].text;
        console.log(`  📝 Claude response: ${responseText.substring(0, 100)}...`);

        // Parse Claude's JSON response
        const claudeResult = JSON.parse(responseText);

        // Map category name to ID
        const category = userCategories.find(c => c.name === claudeResult.category);

        suggestions.push({
          transaction_id: transaction.id,
          category: claudeResult.category,
          categoryId: category?.id || null,
          confidence: claudeResult.confidence,
          reasoning: claudeResult.reasoning,
          source: 'claude',
        });

        console.log(`  ✅ Claude suggested: ${claudeResult.category} (${claudeResult.confidence})`);

      } catch (error) {
        console.error(`  ❌ Claude error for "${payee}":`, error.message);
        suggestions.push({
          transaction_id: transaction.id,
          category: null,
          categoryId: null,
          confidence: 0,
          reasoning: 'AI categorization failed',
          source: 'error',
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ [Agent 2] Categorization complete!`);
    console.log(`   - Total suggestions: ${suggestions.length}`);
    console.log(`   - Claude API calls: ${claudeCallsCount}`);
    console.log(`   - Duration: ${duration}ms`);

    res.json({
      success: true,
      suggestions,
      stats: {
        total: suggestions.length,
        claudeCalls: claudeCallsCount,
        durationMs: duration,
      },
    });

  } catch (error) {
    console.error('\n❌ [Agent 2] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Anthropic PDF Agent Server',
    apiKeyConfigured: !!process.env.VITE_ANTHROPIC_API_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Anthropic Agent Server running on http://localhost:${PORT}`);
  console.log(`📡 Agent 1 (PDF Parser): POST http://localhost:${PORT}/api/process-pdf`);
  console.log(`🎯 Agent 2 (Categorizer): POST http://localhost:${PORT}/api/suggest-categories`);
  console.log(`🏥 Health check: GET http://localhost:${PORT}/health\n`);
});
