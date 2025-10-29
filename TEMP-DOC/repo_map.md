# Repository Architecture Map: Actual Budget + AI Agents

**Generated:** 2025-10-28
**Analysis Version:** v2.0

---

## Executive Summary

This is a **Yarn workspaces monorepo** containing Actual Budget (a local-first personal finance application) with two integrated AI agents powered by Anthropic Claude API. Both agents share a single **Node.js Agent Server** (`anthropic-pdf-agent/`) that handles all Claude API interactions.

### Critical Integration Point

**Both agents share the same server.js file** - This is the primary point where Agent 1 and Agent 2 could potentially interfere with each other, though analysis shows they operate on separate endpoints without conflicts.

---

## Repository Structure

```
/
├── packages/                          # Yarn workspace packages
│   ├── loot-core/                     # Core business logic (Node + Browser)
│   │   ├── src/
│   │   │   ├── server/
│   │   │   │   ├── transactions/import/
│   │   │   │   │   ├── claude-pdf-processor.ts    # Agent 1: Browser→Agent Server
│   │   │   │   │   ├── pdf-adapter.web.ts         # Agent 1: Main orchestrator
│   │   │   │   │   ├── transaction-mapper.ts      # Agent 1: Response mapper
│   │   │   │   │   └── parse-file.ts              # File parser router (supports .pdf)
│   │   │   │   └── api/                           # (No Agent 2 endpoints - refactored)
│   │   │   ├── client/                            # Client-side utilities
│   │   │   ├── shared/                            # Shared utilities
│   │   │   └── platform/                          # Platform-specific code
│   │   └── package.json                           # Dependencies: pdfjs-dist, pdf-parse
│   │
│   ├── desktop-client/ (@actual-app/web)          # React frontend (browser + Electron)
│   │   ├── src/
│   │   │   ├── components/modals/
│   │   │   │   ├── ImportTransactionsModal/
│   │   │   │   │   └── ImportTransactionsModal.tsx  # Agent 1 + Agent 2 UI integration
│   │   │   │   └── AICategorizeModal.tsx            # Agent 2 UI modal
│   │   │   ├── hooks/
│   │   │   │   └── useAgent2Context.ts              # Agent 2: Fetch context data
│   │   │   └── util/
│   │   │       └── agent2-service.ts                # Agent 2: Browser→Agent Server
│   │   └── package.json
│   │
│   ├── desktop-electron/              # Electron wrapper
│   ├── sync-server/                   # Optional sync server
│   ├── api/                           # External API
│   ├── crdt/                          # CRDT for sync
│   └── component-library/             # Shared React components
│
├── anthropic-pdf-agent/               # 🔥 SHARED AGENT SERVER (Node.js)
│   ├── server.js                      # ⚠️ BOTH AGENTS SHARE THIS FILE
│   │                                  #    - Line 197: POST /api/process-pdf (Agent 1)
│   │                                  #    - Line 397: POST /api/suggest-categories (Agent 2)
│   │                                  #    - Line 685: GET /health (shared)
│   ├── categorization/                # Agent 2 logic
│   │   ├── prompt.js                  # Agent 2: Prompt engineering
│   │   └── search.js                  # Agent 2: Search algorithms
│   ├── package.json                   # Dependencies: @anthropic-ai/sdk, express, multer, cors, dotenv
│   ├── .env.example
│   └── README.md
│
├── F2_CATEGORY_AGENT/                 # Agent 2 documentation
│   ├── PHASE_2_PRODUCT_SPEC.md
│   ├── PHASE_2_TECHNICAL_PLAN.md
│   └── PHASE_2_DIAGRAMS.md
│
├── TEMP-DOC/                          # Generated documentation (this folder)
│   ├── repo_map.md                    # This file
│   ├── risk_report.md                 # Detailed risk analysis
│   ├── fix_plan.md                    # Implementation guide
│   ├── e2e_spec.md                    # End-to-end test specifications
│   └── status_update.md               # Executive summary
│
├── package.json                       # Root workspace config
├── yarn.lock                          # Dependency lock file
├── fly.actual.toml                    # Fly.io: Actual Budget deployment
├── fly.agent.toml                     # Fly.io: Agent Server deployment
└── CLAUDE.md                          # Project documentation
```

---

## Component Responsibilities Matrix

| Component                                       | Responsibility                                                                                                           | Used By                                 | Dependencies                                     | Status                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| **AGENT 1 (PDF Parser)**                        |
| `anthropic-pdf-agent/server.js` (Lines 197-380) | Receives PDF via FormData, converts to base64, sends to Claude API with PDF document attachment, returns structured JSON | `claude-pdf-processor.ts`               | `@anthropic-ai/sdk`, `express`, `multer`, `cors` | ✅ Working (after category fix)     |
| `claude-pdf-processor.ts`                       | Reads PDF from filesystem, creates FormData, POSTs to Agent Server, returns `ClaudePDFResponse`                          | `pdf-adapter.web.ts`                    | `platform/server/fs`, `platform/server/log`      | ✅ Working                          |
| `pdf-adapter.web.ts`                            | Main orchestrator: calls Claude processor, validates completeness, maps to Actual Budget format                          | `parse-file.ts` (line 94)               | `claude-pdf-processor`, `transaction-mapper`     | ✅ Working                          |
| `transaction-mapper.ts`                         | Maps Claude response to Actual Budget's `ParseFileResult` format, validates transactions, builds notes                   | `pdf-adapter.web.ts`                    | `claude-pdf-processor` types                     | ✅ Working                          |
| `parse-file.ts`                                 | Routes file parsing by extension (`.pdf` → dynamic import of `pdf-adapter`)                                              | `ImportTransactionsModal.tsx`           | All format parsers                               | ⚠️ Module resolution issue          |
| `ImportTransactionsModal.tsx`                   | UI: Upload PDF, parse, display transactions, import. Uses `isPdfFile()` helper to bypass date parsing                    | User                                    | `parse-file`, `agent2-service`                   | ✅ Working                          |
| **AGENT 2 (Category Suggester)**                |
| `anthropic-pdf-agent/server.js` (Lines 397-683) | Receives transactions + context, applies rules/history, calls Claude for uncertain cases, returns category suggestions   | `agent2-service.ts`                     | `@anthropic-ai/sdk`, `./categorization/*`        | 🚧 Implemented (type errors)        |
| `anthropic-pdf-agent/categorization/prompt.js`  | Builds categorization prompts for Claude, checks for rule matches first (optimization)                                   | `server.js` (line 394)                  | `./search.js`                                    | ✅ Implemented                      |
| `anthropic-pdf-agent/categorization/search.js`  | Search algorithms: keyword extraction, Levenshtein distance, deduplication, rule matching                                | `prompt.js`, `server.js` (line 395)     | None                                             | ✅ Implemented                      |
| `agent2-service.ts`                             | Browser service: sends requests to Agent Server with retry logic, health checks                                          | `ImportTransactionsModal.tsx` (line 64) | None (fetch API)                                 | ✅ Implemented                      |
| `useAgent2Context.ts`                           | React hook: fetches categories, rules, historical transactions from Actual Budget DB                                     | `ImportTransactionsModal.tsx` (line 56) | `loot-core` queries                              | ⚠️ Type errors (payee lookup issue) |
| `ImportTransactionsModal.tsx`                   | UI: "Suggest Categories" button, displays suggestions with confidence scores                                             | User                                    | `agent2-service`, `useAgent2Context`             | 🚧 Integrated (type errors)         |
| **SHARED**                                      |
| `anthropic-pdf-agent/server.js` (Line 685)      | Health check endpoint: GET `/health`                                                                                     | Both agents                             | None                                             | ✅ Working                          |

---

## Data Flow Diagrams

### Agent 1: PDF Import Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT 1: PDF → TRANSACTIONS                          │
└─────────────────────────────────────────────────────────────────────────────┘

1. USER UPLOADS PDF
   ↓
   Browser: ImportTransactionsModal.tsx
   ↓ (parse button clicked)
   ↓
2. PARSE FILE ROUTER
   packages/loot-core/src/server/transactions/import/parse-file.ts
   ├─ Detects .pdf extension (line 92)
   └─ Dynamic import: ./pdf-adapter (line 94)
   ↓
3. PDF ADAPTER (Orchestrator)
   packages/loot-core/src/server/transactions/import/pdf-adapter.web.ts
   ├─ Calls processPDFWithClaude(filepath)
   └─ Validates completeness, maps to Actual format
   ↓
4. CLAUDE PDF PROCESSOR (Agent Server Client)
   packages/loot-core/src/server/transactions/import/claude-pdf-processor.ts
   ├─ Reads PDF as binary (fs.readFile)
   ├─ Converts to Blob
   ├─ Creates FormData with PDF file
   ├─ Environment detection (line 56-63):
   │  - window.location.hostname !== 'localhost' → PRODUCTION
   │  - Uses: https://actual-agent-sr.fly.dev (production)
   │  - Or: http://localhost:4000 (development)
   └─ POST /api/process-pdf
   ↓
   ┌─────────────────────────────────────────────────────────────────────────┐
   │              NETWORK BOUNDARY: Browser → Node.js Server                 │
   └─────────────────────────────────────────────────────────────────────────┘
   ↓
5. AGENT SERVER (Node.js)
   anthropic-pdf-agent/server.js (Lines 197-380)
   ├─ Multer receives FormData upload
   ├─ Reads PDF file from disk
   ├─ Converts to base64 (line 208)
   ├─ Builds comprehensive agent prompt (lines 212-268)
   └─ Calls Claude API with streaming (line 277)
      ↓
      ┌───────────────────────────────────────────────────────────────────┐
      │           EXTERNAL API: Anthropic Claude API                      │
      │           Model: claude-3-5-sonnet-20241022                       │
      │           Max tokens: 8192 (supports 100+ transactions)           │
      └───────────────────────────────────────────────────────────────────┘
      ↓
   ├─ Stream response chunks (line 301-312)
   ├─ Check stop_reason for truncation (line 331-335)
   ├─ Parse JSON response (line 343)
   └─ Return ClaudePDFResponse:
      {
        bankName: "Santander España",
        accountNumber: "ES24...",
        transactions: [
          {
            date: "2025-07-17",
            payee: "La Mina, Madrid",    // 🎯 CURATED
            notes: "Pago Movil En La Mina, Madrid",
            amount: -41.80,
            confidence: 0.95,
            category: "Restaurantes"     // OPTIONAL - not used by Agent 1
          }
        ],
        totalTransactionsFound: 28,
        extractionComplete: true,
        success: true
      }
   ↓
6. TRANSACTION MAPPER
   packages/loot-core/src/server/transactions/import/transaction-mapper.ts
   ├─ Validates required fields (date, payee, amount)
   ├─ Builds notes with bank context (line 99-109)
   ├─ Adds confidence indicator if < 0.8
   └─ Returns ParseFileResult:
      {
        errors: [],
        transactions: [
          {
            date: "2025-07-17",
            payee_name: "La Mina, Madrid",
            imported_payee: "La Mina, Madrid",
            notes: "[Santander España - ES24...] Pago Movil En La Mina, Madrid",
            // NOTE: category field REMOVED (was causing type error)
            amount: -41.80,
            __claude_confidence: 0.95
          }
        ]
      }
   ↓
7. UI DISPLAY
   ImportTransactionsModal.tsx
   ├─ Displays transactions in table
   ├─ User reviews and confirms
   └─ Imports to Actual Budget
```

### Agent 2: Category Suggestion Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT 2: CATEGORY SUGGESTIONS                             │
└─────────────────────────────────────────────────────────────────────────────┘

1. USER CLICKS "SUGGEST CATEGORIES"
   ↓
   Browser: ImportTransactionsModal.tsx
   ↓
2. FETCH CONTEXT DATA
   packages/desktop-client/src/hooks/useAgent2Context.ts
   ├─ Query 1: Categories from Redux (already loaded)
   ├─ Query 2: Active rules from loot-core DB
   ├─ Query 3: Historical transactions
   └─ Transform to Agent 2 format
   ↓
3. AGENT 2 SERVICE CLIENT
   packages/desktop-client/src/util/agent2-service.ts
   ├─ Environment detection (same as Agent 1)
   ├─ Build request payload
   └─ POST /api/suggest-categories with 30s timeout, retry logic
   ↓
   ┌─────────────────────────────────────────────────────────────────────────┐
   │              NETWORK BOUNDARY: Browser → Node.js Server                 │
   └─────────────────────────────────────────────────────────────────────────┘
   ↓
4. AGENT SERVER (Node.js) - SAME FILE AS AGENT 1
   anthropic-pdf-agent/server.js (Lines 397-683)
   ├─ Receives request body
   ├─ Load user context (categories/rules from request body)
   ├─ Group transactions by payee
   ├─ Build payee context from historical data
   └─ Categorize each transaction:
      ├─ STEP 1: Check rule match → 98% confidence
      ├─ STEP 2: Check historical data → 95% confidence
      └─ STEP 3: Call Claude API → variable confidence
   ↓
   Return Agent2Response:
   {
     success: true,
     suggestions: [
       {
         transaction_id: "tx123",
         category: "Restaurantes",
         categoryId: "cat456",
         confidence: 0.92,
         reasoning: "Based on 5 historical transactions",
         source: "history"
       }
     ],
     stats: {
       total: 10,
       claudeCalls: 3,
       durationMs: 4500
     }
   }
   ↓
5. UI DISPLAY
   ImportTransactionsModal.tsx (or AICategorizeModal.tsx)
   ├─ Displays suggestions with confidence scores
   ├─ User can accept/edit/ignore
   └─ Applies categories to transactions
```

### Shared Infrastructure & Potential Conflict Points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHARED INFRASTRUCTURE                                     │
└─────────────────────────────────────────────────────────────────────────────┘

AGENT SERVER (anthropic-pdf-agent/server.js)
├─ Line 1-82: Initialization (SHARED)
│  ├─ Line 16-18: Load .env from multiple sources
│  ├─ Line 32-48: API key validation (fail-fast)
│  ├─ Line 65-76: Express app + CORS + multer
│  └─ Line 79-81: Anthropic client initialization
│
├─ Line 197-380: Agent 1 endpoint (PDF processing)
│  POST /api/process-pdf
│  Uses: multer.single('pdf'), anthropic.messages.stream()
│
├─ Line 397-683: Agent 2 endpoint (Category suggestions)
│  POST /api/suggest-categories
│  Uses: express.json(), anthropic.messages.create()
│
└─ Line 685-691: Health check (SHARED)
   GET /health

SHARED ENVIRONMENT VARIABLES
├─ VITE_ANTHROPIC_API_KEY (required by both agents)
├─ PORT (default: 4000)
└─ NODE_ENV (production/development)

SHARED DEPENDENCIES (package.json)
├─ @anthropic-ai/sdk: ^0.65.0      # Claude API client
├─ express: ^4.21.2                # Web server
├─ cors: ^2.8.5                    # CORS middleware
├─ dotenv: ^16.4.7                 # Environment variables
└─ multer: ^1.4.5-lts.1            # File upload (Agent 1 only)

POTENTIAL CONFLICT ZONES (Analysis: NO CONFLICTS FOUND)
✅ Shared Express app instance (line 65)
   - Both agents add middleware and routes
   - Order is correct: multer vs express.json()
   - CORS applies to both (correct)

✅ Shared Anthropic client (line 79)
   - Both agents use same API key
   - Rate limits apply to combined usage
   - Token usage tracked separately per request

✅ Shared error handling
   - Errors in one agent don't affect the other
   - Shared server crash would affect both (inherent)

✅ Shared environment detection
   - Both agents use same production/dev logic
   - Same URL detection in browser clients
```

---

## Dependency Analysis

### External Dependencies

**Root (`package.json`):**

- Build tools: `typescript`, `vite`, `eslint`, `prettier`
- Monorepo: `yarn@4.9.1` (workspace support)
- Testing: No shared test framework (per-package)

**Agent Server (`anthropic-pdf-agent/package.json`):**

```json
{
  "@anthropic-ai/sdk": "^0.65.0", // Claude API client (both agents)
  "express": "^4.21.2", // Web server (both agents)
  "cors": "^2.8.5", // CORS (both agents)
  "dotenv": "^16.4.7", // Environment variables (both agents)
  "multer": "^1.4.5-lts.1" // File upload (Agent 1 only)
}
```

**loot-core (`packages/loot-core/package.json`):**

- PDF processing: `pdfjs-dist: ^5.4.149`, `pdf-parse: ^1.1.1` (NOT USED - dead dependencies)
- Database: `better-sqlite3: ^12.2.0` (Node), `absurd-sql: 0.0.54` (Browser)
- File parsing: `csv-parse: ^5.6.0`, `adm-zip`, `uuid`

**desktop-client (`packages/desktop-client/package.json`):**

- React: `react: 19.1.1`, `react-dom: 19.1.1`
- State: `react-redux: ^9.2.0`, `@reduxjs/toolkit`
- UI: `@actual-app/components`, `react-modal`, `react-grid-layout`
- i18n: `i18next: ^25.2.1`, `react-i18next: ^15.5.3`

### Internal Dependencies (Workspace References)

```
desktop-client (@actual-app/web)
├── depends on: loot-core (workspace:*)
│   └── provides: queries, Redux, platform abstractions
│
├── depends on: @actual-app/components (workspace:*)
│   └── provides: UI components
│
└── uses: agent2-service.ts (internal)
    └── calls: anthropic-pdf-agent server (external)

loot-core
├── depends on: @actual-app/crdt (workspace:^)
│   └── provides: CRDT data structures for sync
│
└── uses: claude-pdf-processor.ts (internal)
    └── calls: anthropic-pdf-agent server (external)
```

### Version Conflicts

**✅ No major conflicts detected**, but:

1. **Dead dependencies in loot-core**: `pdfjs-dist` and `pdf-parse` are unused (Agent 1 uses Claude's native PDF support)
2. **Anthropic SDK version**: `^0.65.0` is recent - check for breaking changes when updating
3. **React 19.1.1**: Using React 19 (recent version) - ensure compatibility

### New Dependencies Added with Agent 2

**None!** Agent 2 uses the same Agent Server and dependencies as Agent 1. The only new code is:

- `anthropic-pdf-agent/categorization/*.js` (no new deps)
- `packages/desktop-client/src/util/agent2-service.ts` (no new deps)
- `packages/desktop-client/src/hooks/useAgent2Context.ts` (no new deps)

---

## Configuration Map

### Environment Variables

#### Browser (Actual Budget)

- **None** - No API keys exposed to browser
- Environment detection: `window.location.hostname`
  - `localhost` or `127.0.0.1` → Development mode
  - Anything else → Production mode

#### Agent Server (`anthropic-pdf-agent/`)

```bash
# Required
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...  # Claude API key (used by both agents)

# Optional (with defaults)
PORT=4000                                # Server port (default: 4000)
NODE_ENV=production                      # Environment (default: undefined)
```

### API Endpoints

#### Agent Server Endpoints

**Base URLs:**

- **Development**: `http://localhost:4000`
- **Production**: `https://actual-agent-sr.fly.dev`

**Endpoints:**

1. **POST /api/process-pdf** (Agent 1)

   - Content-Type: `multipart/form-data`
   - Body: `pdf` file (via multer)
   - Response: `ClaudePDFResponse` (JSON)

2. **POST /api/suggest-categories** (Agent 2)

   - Content-Type: `application/json`
   - Body: `Agent2Request` (transactions + context)
   - Response: `Agent2Response` (JSON)

3. **GET /health** (Shared)
   - Response: `{ status: "healthy", service: "...", apiKeyConfigured: bool }`

### Deployment Configuration (Fly.io)

**Actual Budget:**

- App: `actual-budget-sr`
- URL: `https://actual-budget-sr.fly.dev`
- Size: ~297 MB
- Config: `fly.actual.toml`

**Agent Server:**

- App: `actual-agent-sr`
- URL: `https://actual-agent-sr.fly.dev`
- Size: ~76 MB
- Config: `fly.agent.toml`
- **Min machines running: 1** - Always-on to prevent "Failed to fetch" errors
- **Health check**: GET /health every 30s

---

## Technology Stack

### Languages

- **TypeScript**: Primary language for frontend and loot-core
- **JavaScript (CommonJS)**: Agent Server (Node.js)
- **JavaScript (ES6+)**: Modern browser code

### Build System

- **Yarn 4.9.1**: Package manager and workspace orchestration
- **Vite**: Frontend build tool
- **TypeScript Compiler**: Type checking and compilation
- **ESLint + Prettier**: Code quality and formatting

### Runtime Environments

- **Browser**: Chrome, Firefox, Safari, Edge
- **Node.js**: Electron desktop app, Agent Server
- **WebAssembly**: SQLite in browser (absurd-sql)

### Key Libraries

- **React 19.1.1**: UI framework
- **Redux**: State management
- **SQLite**: Database (better-sqlite3 on Node, absurd-sql on web)
- **Anthropic SDK**: Claude API integration
- **Express**: Web server for Agent Server

---

## Key Architectural Patterns

### Platform Abstraction

Code is split by platform using file suffixes:

- `.electron.ts` - Electron/Node.js specific implementation
- `.web.ts` or `.browser.ts` - Web browser implementation
- `.ts` - Shared implementation or Node.js default

Example: `loot-core/src/platform/server/sqlite/`

- `index.electron.ts` - Uses better-sqlite3 (native SQLite)
- `index.web.ts` - Uses absurd-sql (SQLite via WebAssembly)

### Local-First Philosophy

- User data lives primarily on their device
- Sync server is **optional** and stores only encrypted CRDT messages
- The app works fully offline

### CRDT Synchronization

- Changes are captured as CRDT messages with timestamps
- Messages are encrypted before leaving the device
- Server cannot read financial data (zero-knowledge architecture)
- Conflicts are resolved automatically using timestamp ordering

---

## Summary

This repository successfully integrates two AI agents into the Actual Budget ecosystem:

1. **Agent 1 (PDF Parser)**: Production-ready, processes Spanish bank PDFs with high accuracy
2. **Agent 2 (Category Suggester)**: Implemented but requires type safety improvements

**Both agents coexist in the same server without conflicts**, with Agent 1 fully functional and Agent 2 requiring refinements to its payee lookup logic.

**Next Steps**: See `risk_report.md` and `fix_plan.md` for detailed analysis and recommendations.
