# End-to-End Test Specifications

**Generated:** 2025-10-28
**Version:** 1.0
**Test Framework:** Vitest (existing), Playwright (recommended for E2E)

---

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Test Environment Setup](#test-environment-setup)
3. [Agent 1: PDF Import Tests](#agent-1-pdf-import-tests)
4. [Agent 2: Category Suggestion Tests](#agent-2-category-suggestion-tests)
5. [Integration Tests](#integration-tests)
6. [Performance Tests](#performance-tests)
7. [Test Data & Fixtures](#test-data--fixtures)
8. [CI/CD Integration](#cicd-integration)

---

## Testing Strategy

### Test Pyramid

```
         ┌─────────────┐
         │   E2E (5%)  │  ← Playwright tests (this document)
         ├─────────────┤
         │ Integration │  ← Vitest with mocked Agent Server
         │    (15%)    │
         ├─────────────┤
         │   Unit      │  ← Vitest unit tests
         │   (80%)     │
         └─────────────┘
```

### Coverage Goals

| Layer                 | Target Coverage | Current | Gap  |
| --------------------- | --------------- | ------- | ---- |
| **Unit Tests**        | 80%             | ~30%    | 50%  |
| **Integration Tests** | 70%             | 0%      | 70%  |
| **E2E Tests**         | Key flows       | 0%      | 100% |

---

## Test Environment Setup

### Prerequisites

```bash
# Install test dependencies
yarn add -D @playwright/test vitest-mock-extended

# Install browsers for E2E
yarn playwright install chromium

# Set up test database
cp packages/loot-core/src/server/db/test.db packages/loot-core/src/server/db/test-backup.db
```

### Environment Variables (Test)

```bash
# .env.test
VITE_ANTHROPIC_API_KEY=test-key-mock-only
NODE_ENV=test
PORT=4001  # Different port for test server
```

### Mock Agent Server

**File:** `anthropic-pdf-agent/test-server.js`

```javascript
const express = require('express');
const multer = require('multer');
const upload = multer({ dest: 'test-uploads/' });

const app = express();
app.use(express.json());

// Mock PDF processing endpoint
app.post('/api/process-pdf', upload.single('pdf'), (req, res) => {
  res.json({
    bankName: 'Santander España',
    accountNumber: 'ES24TEST',
    transactions: [
      {
        date: '2025-07-17',
        payee: 'Test Merchant',
        notes: 'Test transaction',
        amount: -42.5,
        confidence: 0.95,
      },
    ],
    totalTransactionsFound: 1,
    extractionComplete: true,
    success: true,
  });
});

// Mock category suggestion endpoint
app.post('/api/suggest-categories', (req, res) => {
  const { transactions } = req.body;
  res.json({
    success: true,
    suggestions: transactions.map(tx => ({
      transaction_id: tx.id,
      category: 'Restaurantes',
      categoryId: 'cat-restaurants',
      confidence: 0.92,
      reasoning: 'Test suggestion',
      source: 'test',
    })),
    stats: {
      total: transactions.length,
      claudeCalls: 0,
      durationMs: 100,
    },
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'test-agent-server' });
});

app.listen(4001, () => console.log('Test Agent Server on :4001'));
```

---

## Agent 1: PDF Import Tests

### Unit Tests: `transaction-mapper.ts`

**File:** `packages/loot-core/src/server/transactions/import/transaction-mapper.test.ts`

#### Test Suite 1: mapClaudeToActual()

```typescript
import { describe, it, expect } from 'vitest';
import { mapClaudeToActual } from './transaction-mapper';
import type { ClaudePDFResponse } from './claude-pdf-processor';

describe('transaction-mapper', () => {
  describe('mapClaudeToActual', () => {
    it('should map valid Claude response to Actual Budget format', () => {
      const claudeResponse: ClaudePDFResponse = {
        bankName: 'Santander España',
        accountNumber: 'ES24TEST123',
        transactions: [
          {
            date: '2025-07-17',
            payee: 'La Mina, Madrid',
            notes: 'Pago Movil En La Mina',
            amount: -41.8,
            confidence: 0.95,
          },
        ],
        totalTransactionsFound: 1,
        extractionComplete: true,
        success: true,
      };

      const result = mapClaudeToActual(claudeResponse);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2025-07-17',
        payee_name: 'La Mina, Madrid',
        imported_payee: 'La Mina, Madrid',
        amount: -41.8,
        __claude_confidence: 0.95,
      });
      expect(result.transactions[0].notes).toContain('Santander España');
      expect(result.transactions[0].notes).toContain('ES24TEST123');
    });

    it('should handle incomplete extraction', () => {
      const claudeResponse: ClaudePDFResponse = {
        bankName: 'Santander España',
        transactions: [
          {
            date: '2025-07-17',
            payee: 'Test',
            notes: '',
            amount: -10,
            confidence: 0.9,
          },
        ],
        totalTransactionsFound: 1,
        extractionComplete: false, // ⚠️ INCOMPLETE
        success: true,
      };

      const result = mapClaudeToActual(claudeResponse);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('incomplete');
    });

    it('should filter out transactions with missing required fields', () => {
      const claudeResponse: ClaudePDFResponse = {
        bankName: 'Santander España',
        transactions: [
          { date: '', payee: 'Test', notes: '', amount: -10, confidence: 0.9 }, // ❌ Missing date
          {
            date: '2025-07-17',
            payee: '',
            notes: '',
            amount: -10,
            confidence: 0.9,
          }, // ❌ Missing payee
          {
            date: '2025-07-17',
            payee: 'Test',
            notes: '',
            amount: NaN,
            confidence: 0.9,
          }, // ❌ Invalid amount
          {
            date: '2025-07-17',
            payee: 'Valid',
            notes: '',
            amount: -10,
            confidence: 0.9,
          }, // ✅ Valid
        ],
        totalTransactionsFound: 4,
        extractionComplete: true,
        success: true,
      };

      const result = mapClaudeToActual(claudeResponse);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].payee_name).toBe('Valid');
    });

    it('should add confidence note for low confidence transactions', () => {
      const claudeResponse: ClaudePDFResponse = {
        bankName: 'Santander España',
        transactions: [
          {
            date: '2025-07-17',
            payee: 'Test',
            notes: 'Note',
            amount: -10,
            confidence: 0.75,
          }, // Low confidence
        ],
        totalTransactionsFound: 1,
        extractionComplete: true,
        success: true,
      };

      const result = mapClaudeToActual(claudeResponse);

      expect(result.transactions[0].notes).toContain('confidence: 75%');
    });

    it('should NOT include category field in output', () => {
      const claudeResponse: ClaudePDFResponse = {
        bankName: 'Santander España',
        transactions: [
          {
            date: '2025-07-17',
            payee: 'Test',
            notes: '',
            category: 'Restaurantes', // Claude might return this
            amount: -10,
            confidence: 0.9,
          },
        ],
        totalTransactionsFound: 1,
        extractionComplete: true,
        success: true,
      };

      const result = mapClaudeToActual(claudeResponse);

      expect(result.transactions[0]).not.toHaveProperty('category');
    });

    it('should handle Claude processing failure', () => {
      const claudeResponse: ClaudePDFResponse = {
        bankName: 'Unknown',
        transactions: [],
        totalTransactionsFound: 0,
        extractionComplete: false,
        success: false,
        error: 'API key invalid',
      };

      const result = mapClaudeToActual(claudeResponse);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].internal).toContain('API key invalid');
      expect(result.transactions).toHaveLength(0);
    });
  });
});
```

**Expected Result:** 7/7 tests pass, >90% coverage

---

### Unit Tests: `claude-pdf-processor.ts`

**File:** `packages/loot-core/src/server/transactions/import/claude-pdf-processor.test.ts`

#### Test Suite 2: processPDFWithClaude() (Mocked)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPDFWithClaude } from './claude-pdf-processor';
import * as fs from '../../../platform/server/fs';

// Mock global fetch
global.fetch = vi.fn();

// Mock filesystem
vi.mock('../../../platform/server/fs', () => ({
  readFile: vi.fn(),
}));

describe('claude-pdf-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully process PDF and return transactions', async () => {
    // Mock PDF file read
    const mockPdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header
    vi.mocked(fs.readFile).mockResolvedValue(mockPdfData);

    // Mock Agent Server response
    const mockResponse = {
      bankName: 'Santander España',
      transactions: [
        {
          date: '2025-07-17',
          payee: 'Test',
          notes: '',
          amount: -10,
          confidence: 0.9,
        },
      ],
      totalTransactionsFound: 1,
      extractionComplete: true,
      success: true,
    };

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await processPDFWithClaude('/test/file.pdf');

    expect(result.success).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(fs.readFile).toHaveBeenCalledWith('/test/file.pdf', 'binary');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/process-pdf'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should handle Agent Server error', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    );
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    const result = await processPDFWithClaude('/test/file.pdf');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent Server error (500)');
  });

  it('should handle empty PDF file', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(new Uint8Array([])); // Empty

    const result = await processPDFWithClaude('/test/file.pdf');

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should use correct Agent Server URL based on environment', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    );
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        transactions: [],
        totalTransactionsFound: 0,
        extractionComplete: true,
        bankName: 'Test',
      }),
    } as Response);

    // Mock browser environment
    global.window = {
      location: { hostname: 'actual-budget-sr.fly.dev' },
    } as any;

    await processPDFWithClaude('/test/file.pdf');

    expect(fetch).toHaveBeenCalledWith(
      'https://actual-agent-sr.fly.dev/api/process-pdf',
      expect.anything(),
    );
  });
});
```

**Expected Result:** 4/4 tests pass, >70% coverage

---

### Integration Test: Full PDF Import Flow

**File:** `packages/loot-core/src/server/transactions/import/pdf-import.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseFile } from './parse-file';
import { setupTestServer, teardownTestServer } from './test-helpers';

describe('PDF Import Integration', () => {
  beforeAll(async () => {
    await setupTestServer(); // Starts mock Agent Server on port 4001
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  it('should import PDF with 1 transaction', async () => {
    const result = await parseFile('/fixtures/santander-1-transaction.pdf', {
      fileType: 'pdf',
      accountId: 'test-account',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].date).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(result.transactions[0].amount).toBeLessThan(0); // Expense
  });

  it('should import PDF with 50 transactions', async () => {
    const result = await parseFile('/fixtures/santander-50-transactions.pdf', {
      fileType: 'pdf',
      accountId: 'test-account',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(50);
    expect(result.transactions.every(tx => tx.payee_name)).toBe(true);
  });

  it('should handle Revolut PDF format', async () => {
    const result = await parseFile('/fixtures/revolut-sample.pdf', {
      fileType: 'pdf',
      accountId: 'test-account',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.transactions.length).toBeGreaterThan(0);
  });
});
```

---

### E2E Test: User Workflow (Playwright)

**File:** `e2e/pdf-import.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('PDF Import User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    // Login if needed
    await page.click('text=Accounts');
    await page.click('text=Import');
  });

  test('should upload and parse PDF successfully', async ({ page }) => {
    // Upload PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('fixtures/santander-1-transaction.pdf');

    // Wait for parsing
    await page.click('button:has-text("Parse")');
    await expect(page.locator('text=1 transaction found')).toBeVisible({
      timeout: 30000,
    });

    // Verify transaction displayed
    await expect(page.locator('text=La Mina, Madrid')).toBeVisible();
    await expect(page.locator('text=-41.80')).toBeVisible();

    // Import transaction
    await page.click('button:has-text("Import")');
    await expect(page.locator('text=Import successful')).toBeVisible();
  });

  test('should show error for invalid PDF', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('fixtures/invalid.pdf');

    await page.click('button:has-text("Parse")');
    await expect(page.locator('text=Failed to parse PDF')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should handle Agent Server offline gracefully', async ({
    page,
    context,
  }) => {
    // Block Agent Server requests
    await context.route('**/api/process-pdf', route => route.abort());

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('fixtures/santander-1-transaction.pdf');

    await page.click('button:has-text("Parse")');
    await expect(page.locator('text=Agent Server error')).toBeVisible({
      timeout: 10000,
    });
  });
});
```

**Run with:**

```bash
yarn playwright test e2e/pdf-import.spec.ts
```

---

## Agent 2: Category Suggestion Tests

### Unit Tests: `useAgent2Context.ts`

**File:** `packages/desktop-client/src/hooks/useAgent2Context.test.ts`

#### Test Suite 3: useAgent2Context()

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAgent2Context } from './useAgent2Context';
import type { TransactionEntity } from 'loot-core/types/models';

// Mock dependencies
vi.mock('loot-core/platform/client/fetch', () => ({
  send: vi.fn(),
}));

vi.mock('./useCategories', () => ({
  useCategories: () => [
    { id: 'cat-restaurants', name: 'Restaurantes', hidden: false },
    { id: 'cat-groceries', name: 'Supermercado', hidden: false },
  ],
}));

describe('useAgent2Context', () => {
  const mockTransactions: TransactionEntity[] = [
    {
      id: 'tx1',
      account: 'acc1',
      payee: 'payee1',
      imported_payee: 'La Mina, Madrid',
      amount: -4180,
      date: '2025-07-17',
      notes: 'Test transaction',
    },
  ];

  it('should extract payee filters from transactions', () => {
    const { result } = renderHook(() => useAgent2Context(mockTransactions));

    waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      // Should extract imported_payee
      expect(
        result.current.historicalTransactions.some(
          ht => ht.payeeName === 'La Mina, Madrid',
        ),
      ).toBe(true);
    });
  });

  it('should group historical transactions by payee + category', async () => {
    // Mock historical data with duplicates
    vi.mocked(send).mockResolvedValue([
      {
        id: 'tx1',
        payee: 'payee1',
        imported_payee: 'La Mina',
        category: 'cat-restaurants',
        date: '2025-07-01',
      },
      {
        id: 'tx2',
        payee: 'payee1',
        imported_payee: 'La Mina',
        category: 'cat-restaurants',
        date: '2025-07-15',
      },
      {
        id: 'tx3',
        payee: 'payee1',
        imported_payee: 'La Mina',
        category: 'cat-restaurants',
        date: '2025-07-20',
      },
    ]);

    const { result } = renderHook(() => useAgent2Context(mockTransactions));

    await waitFor(() => {
      const laMinaHistory = result.current.historicalTransactions.find(
        ht => ht.payeeName === 'La Mina' && ht.categoryName === 'Restaurantes',
      );
      expect(laMinaHistory?.frequency).toBe(3);
      expect(laMinaHistory?.date).toBe('2025-07-20'); // Most recent
    });
  });

  it('should filter out hidden categories', () => {
    const { result } = renderHook(() => useAgent2Context(mockTransactions));

    waitFor(() => {
      expect(result.current.categories.every(c => !c.hidden)).toBe(true);
      expect(result.current.categories.every(c => c.id !== 'income')).toBe(
        true,
      );
    });
  });
});
```

**Expected Result:** 3/3 tests pass, >80% coverage

---

### Integration Test: Category Suggestion Flow

**File:** `packages/desktop-client/src/util/agent2-service.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { suggestCategoriesWithRetry } from './agent2-service';
import {
  setupTestServer,
  teardownTestServer,
} from '../../../loot-core/src/server/transactions/import/test-helpers';

describe('Agent 2 Integration', () => {
  beforeAll(async () => {
    await setupTestServer(); // Mock Agent Server
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  it('should suggest categories for transactions', async () => {
    const mockContext = {
      categories: [{ id: 'cat-restaurants', name: 'Restaurantes' }],
      rules: [],
      historicalTransactions: [
        {
          payeeName: 'La Mina',
          categoryName: 'Restaurantes',
          category: 'cat-restaurants',
          date: '2025-07-01',
          frequency: 5,
        },
      ],
    };

    const mockTransactions = [
      {
        id: 'tx1',
        payee_name: 'La Mina, Madrid',
        payee: 'payee1',
        amount: -4180,
        date: '2025-07-17',
        notes: 'Test',
      },
    ];

    const result = await suggestCategoriesWithRetry(
      mockTransactions,
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].category).toBe('Restaurantes');
    expect(result.suggestions[0].confidence).toBeGreaterThan(0.8);
  });

  it('should handle Agent Server timeout with retry', async () => {
    // TODO: Implement timeout simulation
  });
});
```

---

### E2E Test: Category Suggestion Workflow

**File:** `e2e/category-suggestion.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Category Suggestion Flow', () => {
  test('should suggest categories after PDF import', async ({ page }) => {
    // Import PDF first
    await page.goto('http://localhost:3001');
    await page.click('text=Import');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('fixtures/santander-50-transactions.pdf');
    await page.click('button:has-text("Parse")');

    await expect(page.locator('text=50 transactions found')).toBeVisible({
      timeout: 30000,
    });

    // Click "Suggest Categories" button
    await page.click('button:has-text("Suggest Categories")');

    // Wait for suggestions
    await expect(page.locator('text=Category suggestions ready')).toBeVisible({
      timeout: 30000,
    });

    // Verify confidence scores displayed
    const firstSuggestion = page
      .locator('[data-testid="suggestion-0"]')
      .first();
    await expect(firstSuggestion.locator('text=/\\d{1,3}%/')).toBeVisible(); // Confidence percentage

    // Accept all suggestions
    await page.click('button:has-text("Accept All")');
    await expect(page.locator('text=Categories applied')).toBeVisible();

    // Import transactions
    await page.click('button:has-text("Import")');
    await expect(page.locator('text=50 transactions imported')).toBeVisible();
  });

  test('should allow manual category edit after suggestion', async ({
    page,
  }) => {
    // ... import and suggest flow ...

    // Edit first suggestion
    const firstCategory = page
      .locator('[data-testid="category-select-0"]')
      .first();
    await firstCategory.click();
    await page.click('text=Supermercado');

    // Verify change
    await expect(firstCategory).toContainText('Supermercado');
  });
});
```

---

## Performance Tests

### Test Suite 4: Load & Performance

```typescript
describe('Performance Tests', () => {
  it('should process 100-transaction PDF in <60 seconds', async () => {
    const start = Date.now();

    const result = await parseFile('/fixtures/santander-100-transactions.pdf', {
      fileType: 'pdf',
      accountId: 'test-account',
    });

    const duration = Date.now() - start;

    expect(result.transactions).toHaveLength(100);
    expect(duration).toBeLessThan(60000); // 60 seconds
  });

  it('should suggest categories for 100 transactions in <10 seconds', async () => {
    const mockTransactions = Array.from({ length: 100 }, (_, i) => ({
      id: `tx${i}`,
      payee_name: `Merchant ${i}`,
      amount: -1000,
      date: '2025-07-17',
      notes: '',
    }));

    const start = Date.now();
    const result = await suggestCategoriesWithRetry(
      mockTransactions,
      mockContext,
    );
    const duration = Date.now() - start;

    expect(result.suggestions).toHaveLength(100);
    expect(duration).toBeLessThan(10000); // 10 seconds
  });
});
```

---

## Test Data & Fixtures

### PDF Fixtures

**Directory:** `/fixtures/`

| File                             | Description                | Transactions | Bank             |
| -------------------------------- | -------------------------- | ------------ | ---------------- |
| `santander-1-transaction.pdf`    | Single expense transaction | 1            | Santander España |
| `santander-10-transactions.pdf`  | Small statement            | 10           | Santander España |
| `santander-50-transactions.pdf`  | Medium statement           | 50           | Santander España |
| `santander-100-transactions.pdf` | Large statement            | 100          | Santander España |
| `revolut-sample.pdf`             | Revolut format sample      | 25           | Revolut España   |
| `invalid.pdf`                    | Corrupted PDF              | 0            | N/A              |
| `empty.pdf`                      | Empty PDF                  | 0            | N/A              |

**Create Test PDFs:**

```bash
# Use real PDFs (redacted) or generate synthetic PDFs
python scripts/generate-test-pdfs.py
```

### Database Fixtures

**File:** `fixtures/test-database.sql`

```sql
-- Test categories
INSERT INTO categories (id, name, hidden) VALUES
  ('cat-restaurants', 'Restaurantes', 0),
  ('cat-groceries', 'Supermercado', 0),
  ('cat-transport', 'Transporte', 0);

-- Test payees
INSERT INTO payees (id, name) VALUES
  ('payee-la-mina', 'La Mina, Madrid'),
  ('payee-mercadona', 'Mercadona'),
  ('payee-metro', 'Metro Madrid');

-- Test transactions (historical)
INSERT INTO transactions (id, account, payee, category, amount, date) VALUES
  ('tx-hist-1', 'acc1', 'payee-la-mina', 'cat-restaurants', -4180, '2025-07-01'),
  ('tx-hist-2', 'acc1', 'payee-la-mina', 'cat-restaurants', -3500, '2025-07-05'),
  ('tx-hist-3', 'acc1', 'payee-mercadona', 'cat-groceries', -8500, '2025-07-10');

-- Test rules
INSERT INTO rules (id, active, conditions, actions) VALUES
  ('rule-1', 1, '[{"field":"payee","op":"is","value":"payee-metro"}]', '[{"field":"category","value":"cat-transport"}]');
```

---

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/test-agents.yml`

```yaml
name: Test AI Agents

on:
  pull_request:
    paths:
      - 'packages/loot-core/src/server/transactions/import/**'
      - 'packages/desktop-client/src/hooks/useAgent2Context.ts'
      - 'packages/desktop-client/src/util/agent2-service.ts'
      - 'anthropic-pdf-agent/**'

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: yarn install --frozen-lockfile
      - run: yarn workspace loot-core run test --watch=false
      - run: yarn workspace @actual-app/web run test --watch=false

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: yarn install --frozen-lockfile
      - run: cd anthropic-pdf-agent && node test-server.js &
      - run: yarn test:integration
      - run: kill %1

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: yarn install --frozen-lockfile
      - run: yarn playwright install chromium
      - run: yarn start:browser &
      - run: cd anthropic-pdf-agent && yarn start &
      - run: sleep 10 # Wait for servers to start
      - run: yarn playwright test
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### Test Commands

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:all": "yarn test:unit && yarn test:integration && yarn test:e2e"
  }
}
```

---

## Manual Test Checklist

### Agent 1: PDF Import

- [ ] Upload Santander PDF with 1 transaction → Success
- [ ] Upload Santander PDF with 50 transactions → All extracted
- [ ] Upload Revolut PDF → Correct format
- [ ] Upload invalid PDF → Error message displayed
- [ ] Upload empty PDF → Error message displayed
- [ ] Agent Server offline → Graceful error
- [ ] Large PDF (100+ transactions) → Success within 60s
- [ ] PDF with special characters (€, ñ, á) → Correct encoding
- [ ] Date formats parsed correctly → YYYY-MM-DD
- [ ] Negative amounts (expenses) → Correct sign
- [ ] Positive amounts (income) → Correct sign

### Agent 2: Category Suggestion

- [ ] Suggest categories for 10 transactions → All have suggestions
- [ ] Rule match → 98% confidence
- [ ] Historical match (>3 occurrences) → 95% confidence
- [ ] Claude suggestion → >70% confidence
- [ ] Edit suggested category → Change saved
- [ ] Accept all suggestions → All applied
- [ ] Reject suggestion → Category remains null
- [ ] Mixed (some accepted, some rejected) → Correct application

### Combined Flow

- [ ] Import PDF → Suggest → Accept → Import → Verify in database
- [ ] Import PDF → Suggest → Edit some → Import → Verify
- [ ] Import PDF twice (same file) → Deduplication works

---

## Success Criteria

### Unit Tests

- ✅ >80% code coverage for Agent 1
- ✅ >80% code coverage for Agent 2
- ✅ All tests pass in CI

### Integration Tests

- ✅ >70% coverage for integration flows
- ✅ Mock Agent Server works correctly
- ✅ All integration tests pass

### E2E Tests

- ✅ Happy path (PDF import + categorization) works
- ✅ Error cases handled gracefully
- ✅ Performance benchmarks met

### Manual Testing

- ✅ All checklist items completed
- ✅ No regressions in existing functionality
- ✅ User experience is smooth and intuitive

---

## Next Steps

1. **Implement Unit Tests** (Phase 3, Task Group 5-6 in fix_plan.md)
2. **Set up Test Fixtures** (Create PDF samples)
3. **Write Integration Tests** (Task Group 7)
4. **Set up Playwright** (E2E tests)
5. **Integrate with CI/CD** (GitHub Actions)

**Estimated Total Effort:** 13-15 hours (as outlined in fix_plan.md, Phase 3)
