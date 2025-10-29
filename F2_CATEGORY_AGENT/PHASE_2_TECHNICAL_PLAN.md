# Fase 2: Agente de Categorización Inteligente

## Technical Implementation Plan

**Versión:** 2.0  
**Fecha:** Octubre 2025  
**Target:** Claude Code Implementation  
**Estimated Time:** 10-14 días

---

## 📋 Tabla de Contenidos

1. [Prerequisites](#prerequisites)
2. [Arquitectura Técnica](#arquitectura-técnica)
3. [Task 1: API Endpoints en Actual Budget](#task-1-api-endpoints-en-actual-budget)
4. [Task 2: Endpoint del Agente 2](#task-2-endpoint-del-agente-2)
5. [Task 3: Algoritmo de Búsqueda](#task-3-algoritmo-de-búsqueda)
6. [Task 4: Integración con Claude](#task-4-integración-con-claude)
7. [Task 5: Frontend - UI Components](#task-5-frontend---ui-components)
8. [Task 6: Testing](#task-6-testing)
9. [Task 7: Deployment](#task-7-deployment)
10. [Code Snippets Completos](#code-snippets-completos)

---

## ✅ Prerequisites

### Verificar Entorno

```bash
# 1. Node.js y Yarn
node --version  # >= 20
yarn --version  # 4.9.1

# 2. API Key de Anthropic configurada
echo $VITE_ANTHROPIC_API_KEY
# Debe mostrar: sk-ant-api03-...

# 3. Actual Budget corriendo localmente
cd /path/to/actual-budget
yarn start:browser
# Debe abrir http://localhost:3001

# 4. Agent Server corriendo
cd anthropic-pdf-agent
yarn dev
# Debe correr en http://localhost:4000
```

### Estructura de Archivos

```
/path/to/actual-budget/
├── anthropic-pdf-agent/
│   ├── server.js                    ← Modificar (Agente 2)
│   ├── package.json
│   └── categorization/              ← Nuevo directorio
│       ├── search.js                ← Algoritmos de búsqueda
│       ├── prompt.js                ← Prompt engineering
│       └── utils.js                 ← Utilidades
├── packages/
│   ├── loot-core/
│   │   └── src/server/
│   │       ├── api/                 ← Nuevo directorio
│   │       │   ├── categories.ts    ← GET /api/categories
│   │       │   ├── transactions.ts  ← GET /api/transactions/search
│   │       │   └── rules.ts         ← GET /api/rules
│   │       └── db/
│   │           └── index.ts         ← Ya existe
│   └── desktop-client/
│       └── src/components/modals/
│           └── ImportTransactionsModal/
│               ├── ImportTransactionsModal.tsx  ← Modificar
│               └── CategorySuggestions.tsx      ← Nuevo componente
```

---

## 🏗️ Arquitectura Técnica

### Diagrama de Secuencia Completo

```
┌─────────┐         ┌──────────────┐         ┌─────────────┐         ┌──────────┐
│ Browser │         │ Actual Budget│         │  Agent 2    │         │ Claude   │
│   UI    │         │ (sync-server)│         │   Server    │         │   API    │
└────┬────┘         └──────┬───────┘         └──────┬──────┘         └────┬─────┘
     │                     │                        │                     │
     │ 1. User clicks      │                        │                     │
     │ \"Sugerir Categorías\"│                        │                     │
     │─────────────────────>│                        │                     │
     │                     │                        │                     │
     │ 2. setState         │                        │                     │
     │    loading=true     │                        │                     │
     │<────────────────────│                        │                     │
     │                     │                        │                     │
     │ 3. POST /api/suggest-categories             │                     │
     │    { transactions, accountId }               │                     │
     │─────────────────────────────────────────────>│                     │
     │                     │                        │                     │
     │                     │  4. GET /api/categories/:accountId           │
     │                     │<───────────────────────│                     │
     │                     │                        │                     │
     │                     │  5. Return categories  │                     │
     │                     │───────────────────────>│                     │
     │                     │                        │                     │
     │                     │  6. For each unique payee:                   │
     │                     │     GET /api/transactions/search?payee=X     │
     │                     │<───────────────────────│                     │
     │                     │                        │                     │
     │                     │  7. Return similar txs │                     │
     │                     │───────────────────────>│                     │
     │                     │                        │                     │
     │                     │  8. GET /api/rules/:accountId                │
     │                     │<───────────────────────│                     │
     │                     │                        │                     │
     │                     │  9. Return rules       │                     │
     │                     │───────────────────────>│                     │
     │                     │                        │                     │
     │                     │                        │ 10. Build prompt    │
     │                     │                        │     with context    │
     │                     │                        │                     │
     │                     │                        │ 11. Call Claude API │
     │                     │                        │────────────────────>│
     │                     │                        │                     │
     │                     │                        │ 12. Stream response │
     │                     │                        │<────────────────────│
     │                     │                        │                     │
     │                     │                        │ 13. Parse JSON      │
     │                     │                        │                     │
     │ 14. Return suggestions                       │                     │
     │<─────────────────────────────────────────────│                     │
     │                     │                        │                     │
     │ 15. Update UI with  │                        │                     │
     │     categories +    │                        │                     │
     │     confidence +    │                        │                     │
     │     reasoning       │                        │                     │
     │                     │                        │                     │
```

### Decisiones de Diseño

| Decisión                 | Opción Elegida                 | Justificación                    |
| ------------------------ | ------------------------------ | -------------------------------- |
| **Deployment**           | Same server (actual-agent-sr)  | Simplicidad, shared dependencies |
| **DB Access**            | API endpoints de Actual Budget | Seguro, respeta multi-tenancy    |
| **Search Strategy**      | SQL + Fuzzy fallback           | Simple, rápido, sin costo extra  |
| **Context Optimization** | Group by payee + cache         | Reduce llamadas a Claude         |
| **UI Pattern**           | Opt-in button                  | No invasivo, user control        |

---

## Task 1: API Endpoints en Actual Budget

### Objetivo

Crear endpoints HTTP en el sync-server de Actual Budget para que el Agente 2 pueda consultar datos del usuario.

### Ubicación

```
packages/loot-core/src/server/api/
```

### Files a Crear

#### 1.1. `packages/loot-core/src/server/api/categories.ts`

```typescript
/**
 * API endpoint: GET /api/categories/:accountId
 * Returns user's categories for a specific account
 */
import { runQuery } from '../db';
import type { Category } from '../../../types/models';

export async function getAccountCategories(
  accountId: string,
): Promise<Category[]> {
  const query = `
    SELECT 
      c.id,
      c.name,
      c.is_income,
      c.group_id,
      cg.name as group_name,
      cg.is_income as group_is_income
    FROM categories c
    LEFT JOIN category_groups cg ON c.group_id = cg.id
    WHERE c.tombstone = 0
    ORDER BY cg.sort_order, c.sort_order
  `;

  const categories = await runQuery(query);

  return categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    isIncome: cat.is_income === 1,
    groupId: cat.group_id,
    groupName: cat.group_name,
    groupIsIncome: cat.group_is_income === 1,
  }));
}

// Express route handler
export async function handleGetCategories(req, res) {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const categories = await getAccountCategories(accountId);

    res.json({
      success: true,
      categories,
      total: categories.length,
    });
  } catch (error) {
    console.error('[API] Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
```

#### 1.2. `packages/loot-core/src/server/api/transactions.ts`

```typescript
/**
 * API endpoint: GET /api/transactions/search
 * Search for similar transactions based on payee
 */
import { runQuery } from '../db';
import type { Transaction } from '../../../types/models';

export interface SearchTransactionsParams {
  accountId: string;
  payee?: string;
  limit?: number;
  onlyCategorized?: boolean;
}

export async function searchTransactions(params: SearchTransactionsParams) {
  const { accountId, payee, limit = 20, onlyCategorized = true } = params;

  let query = `
    SELECT 
      t.id,
      t.date,
      t.amount,
      t.payee as payee_id,
      p.name as payee_name,
      t.category,
      c.name as category_name,
      t.notes,
      t.cleared
    FROM transactions t
    LEFT JOIN payees p ON t.payee = p.id
    LEFT JOIN categories c ON t.category = c.id
    WHERE t.tombstone = 0
      AND t.is_parent = 0
  `;

  const queryParams: any[] = [];

  // Filter by account (if we're tracking it in transactions)
  // Note: In Actual Budget, account is tracked through the account table relationship
  // For MVP, we'll assume single account context

  // Filter by payee (exact match first, then fuzzy)
  if (payee) {
    query += ` AND p.name = ?`;
    queryParams.push(payee);
  }

  // Only categorized transactions
  if (onlyCategorized) {
    query += ` AND t.category IS NOT NULL`;
  }

  query += ` ORDER BY t.date DESC LIMIT ?`;
  queryParams.push(limit);

  const transactions = await runQuery(query, queryParams);

  return transactions.map(tx => ({
    id: tx.id,
    date: tx.date,
    amount: tx.amount,
    payeeName: tx.payee_name,
    category: tx.category,
    categoryName: tx.category_name,
    notes: tx.notes,
    cleared: tx.cleared === 1,
  }));
}

export async function searchTransactionsFuzzy(
  accountId: string,
  payee: string,
  limit: number = 20,
) {
  // Extract keywords from payee name
  const keywords = payee
    .split(/[\\s,]+/)
    .filter(w => w.length >= 3)
    .slice(0, 3); // Top 3 keywords

  if (keywords.length === 0) {
    return [];
  }

  let query = `
    SELECT 
      t.id,
      t.date,
      t.amount,
      t.payee as payee_id,
      p.name as payee_name,
      t.category,
      c.name as category_name,
      t.notes,
      t.cleared,
      COUNT(*) as frequency
    FROM transactions t
    LEFT JOIN payees p ON t.payee = p.id
    LEFT JOIN categories c ON t.category = c.id
    WHERE t.tombstone = 0
      AND t.is_parent = 0
      AND t.category IS NOT NULL
      AND (
  `;

  const queryParams: any[] = [];
  const conditions = keywords.map(keyword => {
    queryParams.push(`%${keyword}%`);
    return `p.name LIKE ?`;
  });

  query += conditions.join(' OR ');
  query += `)
    GROUP BY p.name, t.category
    ORDER BY frequency DESC, t.date DESC
    LIMIT ?
  `;

  queryParams.push(limit);

  const transactions = await runQuery(query, queryParams);

  return transactions.map(tx => ({
    id: tx.id,
    date: tx.date,
    amount: tx.amount,
    payeeName: tx.payee_name,
    category: tx.category,
    categoryName: tx.category_name,
    notes: tx.notes,
    frequency: tx.frequency,
  }));
}

// Express route handler
export async function handleSearchTransactions(req, res) {
  try {
    const { accountId, payee, limit, fuzzy } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    let transactions;

    if (fuzzy === 'true' && payee) {
      transactions = await searchTransactionsFuzzy(
        accountId as string,
        payee as string,
        parseInt(limit as string) || 20,
      );
    } else {
      transactions = await searchTransactions({
        accountId: accountId as string,
        payee: payee as string,
        limit: parseInt(limit as string) || 20,
        onlyCategorized: true,
      });
    }

    res.json({
      success: true,
      transactions,
      total: transactions.length,
    });
  } catch (error) {
    console.error('[API] Error searching transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
```

#### 1.3. `packages/loot-core/src/server/api/rules.ts`

```typescript
/**
 * API endpoint: GET /api/rules/:accountId
 * Returns active categorization rules for an account
 */
import { runQuery } from '../db';

export interface Rule {
  id: string;
  conditions: Array<{
    field: string;
    op: string;
    value: string;
  }>;
  actions: Array<{
    field: string;
    value: string;
  }>;
  stage: string;
}

export async function getActiveRules(accountId: string): Promise<Rule[]> {
  const query = `
    SELECT 
      r.id,
      r.conditions,
      r.actions,
      r.stage
    FROM rules r
    WHERE r.tombstone = 0
    ORDER BY r.sort_order
  `;

  const rules = await runQuery(query);

  return rules.map(rule => ({
    id: rule.id,
    conditions: JSON.parse(rule.conditions || '[]'),
    actions: JSON.parse(rule.actions || '[]'),
    stage: rule.stage || 'pre',
  }));
}

// Express route handler
export async function handleGetRules(req, res) {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const rules = await getActiveRules(accountId);

    // Filter rules that affect category
    const categoryRules = rules.filter(rule =>
      rule.actions.some(action => action.field === 'category'),
    );

    res.json({
      success: true,
      rules: categoryRules,
      total: categoryRules.length,
    });
  } catch (error) {
    console.error('[API] Error fetching rules:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
```

#### 1.4. Register Routes in Sync Server

**File:** `packages/loot-core/src/server/main.ts` (or wherever routes are registered)

```typescript
import { handleGetCategories } from './api/categories';
import { handleSearchTransactions } from './api/transactions';
import { handleGetRules } from './api/rules';

// Add to your Express app
app.get('/api/categories/:accountId', handleGetCategories);
app.get('/api/transactions/search', handleSearchTransactions);
app.get('/api/rules/:accountId', handleGetRules);
```

### Testing

```bash
# Test categories endpoint
curl http://localhost:5006/api/categories/test-account-id

# Test transactions search (exact)
curl \"http://localhost:5006/api/transactions/search?accountId=test&payee=La%20Mina\"

# Test transactions search (fuzzy)
curl \"http://localhost:5006/api/transactions/search?accountId=test&payee=La%20Mina&fuzzy=true\"

# Test rules
curl http://localhost:5006/api/rules/test-account-id
```

---

## Task 2: Endpoint del Agente 2

### Objetivo

Crear un nuevo endpoint en el agent server que reciba transacciones y retorne sugerencias de categorías.

### Ubicación

```
anthropic-pdf-agent/server.js
```

### Implementation

#### 2.1. Add New Endpoint

**File:** `anthropic-pdf-agent/server.js`

````javascript
/**
 * NUEVO ENDPOINT: POST /api/suggest-categories
 *
 * Request body:
 * {
 *   \"transactions\": [...],
 *   \"accountId\": \"uuid\",
 *   \"actualBudgetUrl\": \"http://localhost:5006\"  // or production URL
 * }
 *
 * Response:
 * {
 *   \"success\": true,
 *   \"suggestions\": [
 *     {
 *       \"trx_id\": \"0\",
 *       \"category\": \"Restaurantes\",
 *       \"confidence\": 0.92,
 *       \"reasoning\": \"Similar to 5 previous transactions\"
 *     }
 *   ]
 * }
 */

app.post('/api/suggest-categories', async (req, res) => {
  console.log('\
🎯 [Agente 2] New categorization request received');

  try {
    const { transactions, accountId, actualBudgetUrl } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      throw new Error('transactions array is required');
    }

    if (!accountId) {
      throw new Error('accountId is required');
    }

    const baseUrl = actualBudgetUrl || 'http://localhost:5006';

    console.log(`📊 [Agente 2] Processing ${transactions.length} transactions`);
    console.log(`🏦 [Agente 2] Account ID: ${accountId}`);
    console.log(`🌐 [Agente 2] Actual Budget URL: ${baseUrl}`);

    // STEP 1: Fetch user's categories
    console.log('📁 [Agente 2] Fetching user categories...');
    const categoriesRes = await fetch(`${baseUrl}/api/categories/${accountId}`);
    if (!categoriesRes.ok) {
      throw new Error(`Failed to fetch categories: ${categoriesRes.statusText}`);
    }
    const { categories } = await categoriesRes.json();
    console.log(`✅ [Agente 2] Loaded ${categories.length} categories`);

    // STEP 2: Fetch categorization rules
    console.log('📋 [Agente 2] Fetching categorization rules...');
    const rulesRes = await fetch(`${baseUrl}/api/rules/${accountId}`);
    if (!rulesRes.ok) {
      throw new Error(`Failed to fetch rules: ${rulesRes.statusText}`);
    }
    const { rules } = await rulesRes.json();
    console.log(`✅ [Agente 2] Loaded ${rules.length} rules`);

    // STEP 3: Group transactions by unique payee (optimize Claude calls)
    const uniquePayees = [...new Set(transactions.map(tx => tx.payee_name))];
    console.log(`🔍 [Agente 2] Found ${uniquePayees.length} unique payees`);

    // STEP 4: For each unique payee, get similar transactions
    const payeeContext = {};

    for (const payee of uniquePayees) {
      console.log(`🔎 [Agente 2] Searching history for: \"${payee}\"`);

      // Try exact match first
      let similarTxs = await fetch(
        `${baseUrl}/api/transactions/search?${new URLSearchParams({
          accountId,
          payee,
          limit: '10',
        })}`
      ).then(r => r.json());

      // If not enough results, try fuzzy search
      if (similarTxs.transactions.length < 3) {
        console.log(`   → Exact match: ${similarTxs.transactions.length} results, trying fuzzy...`);
        similarTxs = await fetch(
          `${baseUrl}/api/transactions/search?${new URLSearchParams({
            accountId,
            payee,
            limit: '10',
            fuzzy: 'true',
          })}`
        ).then(r => r.json());
        console.log(`   → Fuzzy match: ${similarTxs.transactions.length} results`);
      } else {
        console.log(`   → Exact match: ${similarTxs.transactions.length} results`);
      }

      payeeContext[payee] = similarTxs.transactions || [];
    }

    // STEP 5: Build context for Claude
    const sharedContext = {
      userCategories: categories,
      activeRules: rules,
    };

    // STEP 6: Call Claude for each transaction (or batch them)
    console.log('🤖 [Agente 2] Calling Claude AI for categorization...');
    const suggestions = [];

    for (const tx of transactions) {
      const similarTransactions = payeeContext[tx.payee_name] || [];

      // If we have strong historical data, skip Claude (optimization)
      if (similarTransactions.length >= 5) {
        // Find most frequent category
        const categoryFreq = {};
        similarTransactions.forEach(sTx => {
          const cat = sTx.categoryName;
          categoryFreq[cat] = (categoryFreq[cat] || 0) + 1;
        });

        const mostFrequent = Object.entries(categoryFreq)
          .sort(([, a], [, b]) => b - a)[0];

        if (mostFrequent && mostFrequent[1] >= 3) {
          // High confidence from history alone
          const categoryName = mostFrequent[0];
          const category = categories.find(c => c.name === categoryName);

          suggestions.push({
            trx_id: tx.trx_id,
            category: category?.id || null,
            categoryName: categoryName,
            confidence: 0.95,
            reasoning: `Auto-categorized: \"${tx.payee_name}\" appears ${mostFrequent[1]} times as \"${categoryName}\"`,
          });

          console.log(`   ✅ ${tx.payee_name} → ${categoryName} (cached, high confidence)`);
          continue;
        }
      }

      // Call Claude for uncertain cases
      const suggestion = await callClaudeForCategorization({
        transaction: tx,
        ...sharedContext,
        similarTransactions: similarTransactions.slice(0, 5), // Top 5 only
      });

      suggestions.push({
        trx_id: tx.trx_id,
        ...suggestion,
      });

      console.log(`   🤖 ${tx.payee_name} → ${suggestion.categoryName} (${Math.round(suggestion.confidence * 100)}%)`);
    }

    console.log(`✨ [Agente 2] Categorization complete: ${suggestions.length} suggestions`);

    res.json({
      success: true,
      suggestions,
      stats: {
        totalTransactions: transactions.length,
        uniquePayees: uniquePayees.length,
        categoriesAvailable: categories.length,
        rulesActive: rules.length,
      },
    });

  } catch (error) {
    console.error('❌ [Agente 2] Error:', error.message);
    console.error('📚 [Agente 2] Stack:', error.stack);

    res.status(500).json({
      success: false,
      error: error.message,
      suggestions: [],
    });
  }
});

/**
 * Call Claude API for a single transaction categorization
 */
async function callClaudeForCategorization(context) {
  const { transaction, userCategories, activeRules, similarTransactions } = context;

  const prompt = buildCategorizationPrompt({
    transaction,
    userCategories,
    activeRules,
    similarTransactions,
  });

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    temperature: 0,
    messages: [{
      role: 'user',
      content: prompt,
    }],
  });

  const responseText = response.content[0].text;

  // Parse JSON response
  let cleanedText = responseText.trim();
  if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/```json?\
?/g, '').replace(/```\
?$/g, '');
  }

  const result = JSON.parse(cleanedText);

  // Map category name to category ID
  const category = userCategories.find(c => c.name === result.category);

  return {
    category: category?.id || null,
    categoryName: result.category || null,
    confidence: result.confidence || 0,
    reasoning: result.reasoning || 'No reasoning provided',
  };
}
````

---

## Task 3: Algoritmo de Búsqueda

### Objetivo

Implementar lógica eficiente de búsqueda de transacciones similares.

### Ubicación

```
anthropic-pdf-agent/categorization/search.js
```

### Implementation

**File:** `anthropic-pdf-agent/categorization/search.js`

```javascript
/**
 * Search algorithms for finding similar transactions
 */

/**
 * Extract keywords from a payee name
 * Examples:
 *   \"La Mina, Madrid\" → [\"La\", \"Mina\", \"Madrid\"]
 *   \"Loomisp*campo Del Moro\" → [\"Loomisp\", \"campo\", \"Moro\"]
 */
function extractKeywords(payeeName) {
  if (!payeeName) return [];

  return payeeName
    .toLowerCase()
    .replace(/[*,;]/g, ' ') // Remove special chars
    .split(/\\s+/) // Split by whitespace
    .filter(
      word =>
        word.length >= 3 && // Min 3 chars
        !['del', 'la', 'el', 'los', 'las', 'de', 'con', 'en'].includes(word), // Remove common words
    )
    .slice(0, 3); // Top 3 keywords only
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching when SQL LIKE is not enough
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Deduplicate and sort transactions by frequency and recency
 */
function deduplicateAndSort(transactions) {
  // Group by category
  const grouped = {};

  transactions.forEach(tx => {
    const key = tx.categoryName;
    if (!grouped[key]) {
      grouped[key] = {
        categoryName: tx.categoryName,
        category: tx.category,
        frequency: 0,
        lastUsed: tx.date,
        examples: [],
      };
    }

    grouped[key].frequency += tx.frequency || 1;
    grouped[key].examples.push(tx.payeeName);

    // Keep most recent date
    if (tx.date > grouped[key].lastUsed) {
      grouped[key].lastUsed = tx.date;
    }
  });

  // Sort by frequency DESC, then by recency DESC
  return Object.values(grouped).sort((a, b) => {
    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }
    return b.lastUsed - a.lastUsed;
  });
}

/**
 * Check if a rule matches a transaction
 */
function ruleMatches(rule, transaction) {
  return rule.conditions.every(condition => {
    const { field, op, value } = condition;
    const txValue = String(transaction[field] || '').toLowerCase();
    const conditionValue = String(value).toLowerCase();

    switch (op) {
      case 'contains':
        return txValue.includes(conditionValue);
      case 'is':
        return txValue === conditionValue;
      case 'oneOf':
        return JSON.parse(value)
          .map(v => v.toLowerCase())
          .includes(txValue);
      default:
        return false;
    }
  });
}

/**
 * Find best matching rule for a transaction
 */
function findMatchingRule(transaction, rules) {
  for (const rule of rules) {
    if (ruleMatches(rule, transaction)) {
      const categoryAction = rule.actions.find(a => a.field === 'category');
      if (categoryAction) {
        return {
          matched: true,
          categoryId: categoryAction.value,
          rule: rule,
        };
      }
    }
  }

  return { matched: false };
}

module.exports = {
  extractKeywords,
  levenshteinDistance,
  deduplicateAndSort,
  findMatchingRule,
};
```

---

## Task 4: Integración con Claude

### Objetivo

Crear el prompt engineering y parsing de respuestas de Claude.

### Ubicación

```
anthropic-pdf-agent/categorization/prompt.js
```

### Implementation

**File:** `anthropic-pdf-agent/categorization/prompt.js`

```javascript
/**
 * Prompt engineering for categorization agent
 */

function buildCategorizationPrompt(context) {
  const { transaction, userCategories, activeRules, similarTransactions } =
    context;

  // Check if a rule matches
  const { findMatchingRule } = require('./search');
  const ruleMatch = findMatchingRule(transaction, activeRules);

  if (ruleMatch.matched) {
    // If a rule matches, use it directly (no need to call Claude)
    const category = userCategories.find(c => c.id === ruleMatch.categoryId);
    return {
      category: category?.name || null,
      confidence: 0.98,
      reasoning: `Matches active rule: ${JSON.stringify(ruleMatch.rule.conditions)}`,
    };
  }

  // Build prompt for Claude
  const prompt = `You are a transaction categorization expert for Actual Budget, a personal finance app.

I will provide you with:
1. A transaction that needs categorization
2. The user's available categories (their personal list)
3. Similar historical transactions with categories assigned
4. Active categorization rules (if any)

Your task is to suggest the BEST category from the user's list.

## USER'S CATEGORIES
${JSON.stringify(
  userCategories.map(c => ({
    id: c.id,
    name: c.name,
    group: c.groupName,
    isIncome: c.isIncome,
  })),
  null,
  2,
)}

## TRANSACTION TO CATEGORIZE
{
  \"date\": \"${transaction.date}\",
  \"payee\": \"${transaction.payee_name || transaction.payee}\",
  \"amount\": ${transaction.amount},
  \"notes\": \"${transaction.notes || ''}\"
}

## HISTORICAL CONTEXT
${
  similarTransactions.length > 0
    ? JSON.stringify(
        similarTransactions.map(tx => ({
          payee: tx.payeeName,
          category: tx.categoryName,
          date: tx.date,
          amount: tx.amount,
        })),
        null,
        2,
      )
    : '(No similar transactions found in history)'
}

## INSTRUCTIONS

1. **ONLY suggest categories that exist in USER'S CATEGORIES** (never invent new ones)
2. **Learn from history** - If the payee appears multiple times, use the most frequent category
3. **Consider amount** - Income vs expense categories based on positive/negative amount
4. **Reason clearly** - Explain your decision
5. **Be honest about confidence** - If unsure, say so (confidence < 0.7)

## OUTPUT FORMAT

Return ONLY a JSON object (no markdown, no code blocks):

{
  \"category\": \"Category Name\",
  \"confidence\": 0.92,
  \"reasoning\": \"Brief explanation of why this category was chosen\"
}

If you cannot suggest a category with confidence >= 0.5, return:

{
  \"category\": null,
  \"confidence\": 0,
  \"reasoning\": \"Reason why categorization is uncertain\"
}

IMPORTANT: Return ONLY the JSON object, nothing else.`;

  return prompt;
}

module.exports = {
  buildCategorizationPrompt,
};
```

---

## Task 5: Frontend - UI Components

### Objetivo

Modificar ImportTransactionsModal para añadir el botón \"Sugerir Categorías\" y mostrar las sugerencias.

### Ubicación

```
packages/desktop-client/src/components/modals/ImportTransactionsModal/ImportTransactionsModal.tsx
```

### Implementation

#### 5.1. Add State for Category Suggestions

```typescript
// Add new state variables
const [isSuggestingCategories, setIsSuggestingCategories] = useState(false);
const [categorySuggestions, setCategorySuggestions] = useState<
  Map<string, CategorySuggestion>
>(new Map());

interface CategorySuggestion {
  category: string;
  categoryName: string;
  confidence: number;
  reasoning: string;
}
```

#### 5.2. Add Function to Call Agente 2

```typescript
/**
 * Call Agente 2 to suggest categories for transactions
 */
async function handleSuggestCategories() {
  setIsSuggestingCategories(true);

  try {
    console.log('[Category AI] Starting category suggestion process...');
    console.log(
      `[Category AI] Transactions to categorize: ${transactions.length}`,
    );

    // Call agent server
    const agentUrl =
      process.env.NODE_ENV === 'production'
        ? 'https://actual-agent-sr.fly.dev'
        : 'http://localhost:4000';

    const response = await fetch(`${agentUrl}/api/suggest-categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactions: transactions.map(tx => ({
          trx_id: tx.trx_id,
          date: tx.date,
          payee_name: tx.payee,
          amount: tx.amount,
          notes: tx.notes,
        })),
        accountId: accountId,
        actualBudgetUrl: window.location.origin,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Agent Server error (${response.status}): ${await response.text()}`,
      );
    }

    const { success, suggestions, stats } = await response.json();

    if (!success) {
      throw new Error('Categorization failed');
    }

    console.log('[Category AI] Received suggestions:', suggestions.length);
    console.log('[Category AI] Stats:', stats);

    // Create map of trx_id → suggestion
    const suggestionsMap = new Map<string, CategorySuggestion>();
    suggestions.forEach(s => {
      suggestionsMap.set(s.trx_id, {
        category: s.category,
        categoryName: s.categoryName,
        confidence: s.confidence,
        reasoning: s.reasoning,
      });
    });

    setCategorySuggestions(suggestionsMap);

    // Apply suggestions to transactions
    const updatedTransactions = transactions.map(tx => {
      const suggestion = suggestionsMap.get(tx.trx_id);
      if (suggestion && suggestion.category) {
        return {
          ...tx,
          category: suggestion.category,
          // Store suggestion metadata for display
          _aiSuggestion: suggestion,
        };
      }
      return tx;
    });

    setTransactions(updatedTransactions);

    console.log('[Category AI] Applied suggestions to transactions');
  } catch (error) {
    console.error('[Category AI] Error:', error);
    setError({
      parsed: false,
      message: `AI categorization failed: ${error.message}`,
    });
  } finally {
    setIsSuggestingCategories(false);
  }
}
```

#### 5.3. Add UI Button

```typescript
{/* Add button below transaction table, before Import button */}
{transactions.length > 0 && !error && (
  <View style={{ marginTop: 15, marginBottom: 10 }}>
    <ButtonWithLoading
      variant=\"normal\"
      isLoading={isSuggestingCategories}
      isDisabled={isSuggestingCategories || transactions.length === 0}
      onPress={handleSuggestCategories}
    >
      <Stack direction=\"row\" align=\"center\" spacing={1}>
        <SparklesIcon size={16} />
        <Text>
          {isSuggestingCategories
            ? 'Analizando histórico...'
            : 'Sugerir Categorías con AI'}
        </Text>
      </Stack>
    </ButtonWithLoading>

    {categorySuggestions.size > 0 && (
      <Text
        style={{
          marginTop: 5,
          fontSize: 12,
          color: theme.pageTextSubdued
        }}
      >
        ✨ {categorySuggestions.size} categorías sugeridas
      </Text>
    )}
  </View>
)}
```

#### 5.4. Display Suggestions in Transaction Rows

```typescript
// In Transaction component, add suggestion display
{transaction._aiSuggestion && (
  <View
    style={{
      paddingLeft: 20,
      marginTop: 5,
      fontSize: 12,
    }}
  >
    <Stack direction=\"row\" align=\"center\" spacing={1}>
      <RobotIcon size={14} />
      <Text style={{ fontWeight: 'bold' }}>
        {transaction._aiSuggestion.categoryName}
      </Text>
      <Badge
        variant={
          transaction._aiSuggestion.confidence >= 0.9
            ? 'success'
            : transaction._aiSuggestion.confidence >= 0.75
            ? 'warning'
            : 'error'
        }
      >
        {Math.round(transaction._aiSuggestion.confidence * 100)}%
      </Badge>
    </Stack>
    <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
      ℹ️  {transaction._aiSuggestion.reasoning}
    </Text>
  </View>
)}
```

---

## Task 6: Testing

### Test Plan

#### 6.1. Unit Tests

**File:** `anthropic-pdf-agent/categorization/search.test.js`

```javascript
const {
  extractKeywords,
  levenshteinDistance,
  findMatchingRule,
} = require('./search');

describe('Search Algorithms', () => {
  test('extractKeywords removes common Spanish words', () => {
    expect(extractKeywords('La Mina, Madrid')).toEqual(['mina', 'madrid']);
    expect(extractKeywords('Compra en El Corte Inglés')).toEqual([
      'compra',
      'corte',
      'inglés',
    ]);
  });

  test('levenshteinDistance calculates correctly', () => {
    expect(levenshteinDistance('La Mina', 'La Mina')).toBe(0);
    expect(levenshteinDistance('La Mina', 'La Mena')).toBe(1);
    expect(levenshteinDistance('Mercadona', 'Mercadina')).toBe(1);
  });

  test('findMatchingRule finds correct rule', () => {
    const rules = [
      {
        conditions: [{ field: 'payee_name', op: 'contains', value: 'Uber' }],
        actions: [{ field: 'category', value: 'uuid-transport' }],
      },
    ];

    const transaction = { payee_name: 'Uber Trip to Airport' };
    const match = findMatchingRule(transaction, rules);

    expect(match.matched).toBe(true);
    expect(match.categoryId).toBe('uuid-transport');
  });
});
```

#### 6.2. Integration Tests

**Test scenarios:**

```bash
# Scenario 1: Happy path (usuario con historial)
# - Importar PDF con 20 transacciones
# - 15 payees conocidos
# - Click \"Sugerir Categorías\"
# Expected: >85% accuracy, <5 segundos

# Scenario 2: Usuario nuevo (sin historial)
# - Base de datos vacía
# - Click \"Sugerir Categorías\"
# Expected: Sugerencias con baja confianza o null

# Scenario 3: Reglas activas
# - Usuario tiene regla: \"Uber\" → Transporte
# - Importar transacción de Uber
# Expected: Sugerencia \"Transporte\" con 98% confianza

# Scenario 4: Payees con typos
# - Histórico: \"Mercadona\" (10 veces)
# - Nuevo: \"Mercadina\" (typo)
# Expected: Fuzzy matching encuentra \"Mercadona\"

# Scenario 5: Performance test
# - Importar 100 transacciones
# Expected: <10 segundos total
```

#### 6.3. Manual Testing Checklist

```markdown
## Pre-deployment Testing

### Backend (Agent Server)

- [ ] Endpoint /api/suggest-categories responde 200 OK
- [ ] Categories endpoint retorna lista correcta
- [ ] Transactions search (exact) funciona
- [ ] Transactions search (fuzzy) funciona
- [ ] Rules endpoint retorna reglas activas
- [ ] Error handling: accountId inválido → 400
- [ ] Error handling: Anthropic API key inválida → 500

### Frontend (Actual Budget)

- [ ] Botón \"Sugerir Categorías\" visible después de importar
- [ ] Botón deshabilitado cuando no hay transacciones
- [ ] Loading state visible durante procesamiento
- [ ] Sugerencias se muestran con confianza y reasoning
- [ ] Usuario puede editar categorías sugeridas
- [ ] Import funciona con categorías sugeridas
- [ ] Error messages son user-friendly

### End-to-End

- [ ] Flow completo: PDF → transacciones → sugerir → revisar → importar
- [ ] Múltiples imports en la misma sesión
- [ ] Browser refresh no rompe estado
- [ ] Production deployment funciona
```

---

## Task 7: Deployment

### 7.1. Environment Variables

**Production (Fly.io):**

```bash
# Agent Server
fly secrets set VITE_ANTHROPIC_API_KEY=\"sk-ant-api03-...\" -a actual-agent-sr

# Actual Budget (si es necesario)
# No requiere nuevas variables
```

**Local Development:**

```bash
# .env en root del proyecto
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 7.2. Deploy Agent Server

```bash
# Deploy updated agent server
cd /path/to/actual-budget
fly deploy -a actual-agent-sr -c fly.agent.toml

# Verify deployment
fly status -a actual-agent-sr
fly logs -a actual-agent-sr

# Test health check
curl https://actual-agent-sr.fly.dev/health
```

### 7.3. Deploy Actual Budget

```bash
# Deploy updated Actual Budget
fly deploy -a actual-budget-sr -c fly.actual.toml

# Verify deployment
fly status -a actual-budget-sr
fly logs -a actual-budget-sr
```

### 7.4. Smoke Test in Production

```bash
# Test categories endpoint
curl https://actual-budget-sr.fly.dev/api/categories/test-account-id

# Test suggest-categories endpoint (from frontend)
# Upload PDF → Click \"Sugerir Categorías\" → Verify suggestions appear
```

---

## 📦 Code Snippets Completos

### Complete Agente 2 Endpoint (Final Version)

Ver Task 2 arriba para el código completo integrado en `server.js`.

### Complete UI Integration

Ver Task 5 arriba para los cambios completos en `ImportTransactionsModal.tsx`.

---

## 🎯 Success Criteria Checklist

```markdown
### MVP Success Criteria

#### Functional Requirements

- [ ] Agente 2 endpoint deployed and responsive
- [ ] API endpoints for categories, transactions, rules working
- [ ] Search algorithm finds similar transactions
- [ ] Claude integration returns valid suggestions
- [ ] UI button \"Sugerir Categorías\" visible and clickable
- [ ] Suggestions displayed with confidence and reasoning
- [ ] User can accept, edit, or ignore suggestions

#### Performance Requirements

- [ ] P50 latency < 100ms per transaction
- [ ] Total time for 50 transactions < 5 seconds
- [ ] No timeouts or crashes

#### Quality Requirements

- [ ] Accuracy > 70% for known payees
- [ ] Accuracy > 50% for new payees
- [ ] Error messages are clear and actionable
- [ ] No console errors in production

#### UX Requirements

- [ ] Opt-in design (button, not automatic)
- [ ] Loading state visible during processing
- [ ] Confidence scores displayed clearly
- [ ] Reasoning text is understandable
- [ ] User can override any suggestion
```

---

## 🚀 Next Steps Post-MVP

### Phase 2.1: Improvements

1. **Levenshtein distance** for better fuzzy matching
2. **Keyword extraction** improvements (synonyms, stemming)
3. **Confidence scoring** refinements
4. **Caching** for common payees

### Phase 2.2: Advanced Features

1. **Feedback loop**: Track user corrections → improve accuracy
2. **Analytics dashboard**: Track accuracy, adoption, costs
3. **Auto-create rules**: Suggest rules based on corrections
4. **Vectorization**: If accuracy doesn't reach 85%, consider embeddings

### Phase 3: AI Enhancements

1. **Multi-language support**: English, Spanish, French
2. **Category suggestions**: AI suggests new categories based on spending patterns
3. **Budget insights**: \"You spent 40% more on restaurants this month\"

---

## 📚 Referencias Técnicas

### Actual Budget Codebase

- **Database Schema**: `packages/loot-core/src/server/db/schema.sql`
- **Transaction Import**: `packages/loot-core/src/server/transactions/import/`
- **Rules Engine**: `packages/loot-core/src/server/rules/`

### Anthropic Claude

- **API Reference**: https://docs.anthropic.com/en/api/messages
- **Streaming**: https://docs.anthropic.com/en/api/streaming
- **Token Counting**: https://docs.anthropic.com/en/docs/models-overview#model-comparison

### SQLite

- **Full-Text Search**: https://www.sqlite.org/fts5.html
- **JSON Functions**: https://www.sqlite.org/json1.html
- **Performance Tips**: https://www.sqlite.org/optoverview.html

---

## ✉️ Support

**Questions or issues?**

- Email: sebastian.ropero96@gmail.com
- GitHub: Open issue in repo
- Slack: #actual-budget-custom (if applicable)

---

**Document Version:** 2.0  
**Last Updated:** Octubre 2025  
**Status:** Ready for Implementation  
**Estimated Completion:** 10-14 días
