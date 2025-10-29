# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

All commands should be run from the **root directory** (not from child workspaces).

### Development

```bash
# Start browser development (most common for development)
yarn start:browser              # Starts frontend + backend in watch mode

# Start desktop application
yarn start:desktop              # Starts Electron app with all dependencies

# Start sync server with browser
yarn start:server-dev           # Starts sync server + browser app
```

### Building

```bash
yarn build:browser              # Build web application
yarn build:desktop              # Build Electron desktop apps
yarn build:server               # Build sync server
yarn build:api                  # Build external API
```

### Testing

```bash
# Run all tests
yarn test                       # Runs tests across all workspaces

# Run tests for a specific workspace
yarn workspace <workspace-name> run test <path-to-test>

# Important: Always include --watch=false flag when running unit tests
# to prevent watch mode (Vitest is the test runner)
yarn workspace loot-core run test --watch=false
```

### Code Quality

```bash
yarn typecheck                  # Run TypeScript type checking
yarn lint                       # Check code formatting and linting
yarn lint:fix                   # Auto-fix linting and formatting issues
```

## Architecture Overview

Actual Budget is a **local-first** personal finance application with optional cloud synchronization. The architecture consists of three main layers:

### 1. Frontend Layer

- **desktop-client (@actual-app/web)**: React + TypeScript UI that runs in both browser and Electron
- **desktop-electron**: Electron wrapper for native desktop experience

### 2. Core Engine Layer

- **loot-core**: The heart of the application containing all business logic
  - Runs on both Node.js (Electron) and browser (via WebAssembly)
  - Contains server-side logic despite the name (historical artifact)
  - Uses SQLite for local data storage (better-sqlite3 on Node, absurd-sql on web)

### 3. Synchronization Layer (Optional)

- **sync-server (@actual-app/sync-server)**: Node.js + Express server for multi-device sync
- **crdt (@actual-app/crdt)**: Conflict-free Replicated Data Types for conflict resolution

### 4. Integration Layer

- **api (@actual-app/api)**: External API for programmatic access to Actual Budget

## Key Architectural Patterns

### Platform Abstraction

Code is split by platform using file suffixes:

- `.electron.ts` - Electron/Node.js specific implementation
- `.web.ts` or `.browser.ts` - Web browser implementation
- `.ts` - Shared implementation or Node.js default

Example: `loot-core/src/platform/server/sqlite/`

- `index.electron.ts` - Uses better-sqlite3 (native SQLite)
- `index.web.ts` - Uses absurd-sql (SQLite via WebAssembly)

The package.json `exports` field uses conditional exports to load the correct platform version.

### Loot-Core Structure

Despite the name, loot-core contains "server" logic (business logic that runs locally):

```
packages/loot-core/src/
├── server/              # Business logic (runs locally, not on a server!)
│   ├── aql/            # Actual Query Language - custom SQL-like query system
│   ├── budget/         # Budget calculation engine (envelope budgeting)
│   ├── spreadsheet/    # Spreadsheet calculation engine for budget formulas
│   ├── transactions/   # Transaction processing and import/export
│   ├── rules/          # Auto-categorization rules engine
│   ├── accounts/       # Account management and bank sync
│   └── db/             # Database layer and query builder
├── client/             # Client-side utilities and React hooks
├── shared/             # Shared utilities between client and server
└── platform/           # Platform-specific implementations (fs, sqlite, fetch)
```

### Data Storage

- **Primary storage**: SQLite database (`db.sqlite`) stored locally on user's device
- **Web version**: IndexedDB + absurd-sql (SQLite compiled to WebAssembly)
- **Sync storage**: Per-budget SQLite files (`group-{id}.sqlite`) storing CRDT messages
- **Monetary values**: Stored as integers in cents to avoid floating-point errors

### AQL (Actual Query Language)

Custom query language in `packages/loot-core/src/server/aql/`:

- Provides type-safe queries with schema validation
- Compiles to SQL for execution against SQLite
- Used throughout the app for complex financial queries

### Transaction Import System

Located in `packages/loot-core/src/server/transactions/import/`:

- Supports multiple formats: OFX, QFX, CSV, QIF, **PDF (NEW)**
- Extensible parser system with format detection
- Custom parsers per bank (e.g., `parse-file.ts` contains bank-specific logic)

## TypeScript Guidelines

From existing Cursor rules:

### Code Style

- Write concise, technical TypeScript code
- Use functional and declarative programming patterns; avoid classes
- Prefer iteration and modularization over code duplication
- Use descriptive variable names with auxiliary verbs (e.g., `isLoaded`, `hasError`)

### TypeScript Usage

- Use TypeScript for all code; prefer `interface` over `type`
- Avoid enums; use objects or maps instead
- Avoid using `any` or `unknown` unless absolutely necessary - look for type definitions in the codebase
- Avoid type assertions with `as` or `!`; prefer using `satisfies`

### Syntax

- Use the `function` keyword for pure functions
- Favor named exports for components and utilities
- Use declarative JSX, keeping JSX minimal and readable

### Testing

- Vitest is the test runner
- Always use `--watch=false` flag when running unit tests programmatically
- Minimize the number of dependencies you mock - fewer mocks = better tests
- Run workspace-specific tests: `yarn workspace <workspace-name> run test <path>`

## Workspace Structure

This is a Yarn workspaces monorepo:

| Package                                      | Purpose                    |
| -------------------------------------------- | -------------------------- |
| `loot-core`                                  | Core business logic engine |
| `@actual-app/web` (desktop-client)           | React frontend             |
| `desktop-electron`                           | Electron desktop wrapper   |
| `@actual-app/sync-server`                    | Optional sync server       |
| `@actual-app/api`                            | External programmatic API  |
| `@actual-app/crdt`                           | CRDT data structures       |
| `@actual-app/components` (component-library) | Shared React components    |

## Important Notes

### Local-First Philosophy

- User data lives primarily on their device
- Sync server is **optional** and stores only encrypted CRDT messages
- The app works fully offline

### CRDT Synchronization

- Changes are captured as CRDT messages with timestamps
- Messages are encrypted before leaving the device
- Server cannot read financial data (zero-knowledge architecture)
- Conflicts are resolved automatically using timestamp ordering

### Development Environment

- Node.js >= 20 required
- Yarn 4.9.1 (specified in packageManager field)
- Run commands from root directory only

---

## 🆕 PDF Import with Claude AI Agent

### Overview

This repository includes an **AI-powered PDF bank statement import system** for Spanish banks (Santander España and Revolut España). The system uses Anthropic's Claude AI via an Agent Server architecture to:

- ✅ Read PDF bank statements natively (no text extraction needed)
- ✅ Extract ALL transactions with high accuracy (10-100 transactions per PDF)
- ✅ **Curate Payee names intelligently** (e.g., "La Mina, Madrid" vs raw bank descriptions)
- ✅ Validate completeness and provide confidence scores
- ✅ Work seamlessly in **browser** (web version)
- ✅ Deployed in production on Fly.io

### Architecture: Anthropic Agent Server Pattern

Following [Anthropic's Agent Architecture](https://www.anthropic.com/engineering/building-effective-agents), the system uses a **Node.js Agent Server** as an intermediary between the browser and Claude API:

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Browser   │         │   Agent Server   │         │   Claude API    │
│  (Actual    │────────▶│   (Node.js)      │────────▶│  (Anthropic)    │
│   Budget)   │  PDF    │   Port 4000      │  Base64 │                 │
└─────────────┘         └──────────────────┘  + API  └─────────────────┘
                                 │                              │
                                 │                              │
                                 ▼                              ▼
                        FormData Upload                Document Attachment
                        Multer Handler                 PDF Processing

Production URLs:
- Actual Budget: https://actual-budget-sr.fly.dev
- Agent Server: https://actual-agent-sr.fly.dev
- Local development: http://localhost:4000 (agent), http://localhost:3001 (actual)
```

**Why this architecture?**

- **Browser limitations**: Cannot use `@anthropic-ai/sdk` (Node.js only) or direct Claude API (CORS)
- **Agent Server benefits**:
  - Uses proper Anthropic SDK with all features
  - Handles PDF processing server-side
  - Provides detailed logging for debugging
  - Follows Anthropic's recommended patterns

### Components

#### 1. Agent Server (`/anthropic-pdf-agent/`)

**Files:**

- `server.js` - Express server with Anthropic SDK integration
- `package.json` - Dependencies: `@anthropic-ai/sdk`, `express`, `multer`, `cors`
- `.env` - API key: `VITE_ANTHROPIC_API_KEY=sk-ant-...`

**Start the server:**

```bash
cd anthropic-pdf-agent
yarn install
yarn start  # or yarn dev for development
# Server runs on http://localhost:4000
```

**Key features:**

- Receives PDF via FormData upload (`/api/process-pdf`)
- Converts PDF to base64
- Sends to Claude API with comprehensive prompt
- Returns structured JSON with transactions

#### 2. Browser Client (Actual Budget)

**Files in `packages/loot-core/src/server/transactions/import/`:**

- **`claude-pdf-processor.ts`** - Sends PDF to Agent Server via FormData

  - Reads PDF file from virtual filesystem
  - Creates Blob and FormData
  - Fetches from `http://localhost:4000/api/process-pdf`
  - Returns `ClaudePDFResponse`

- **`transaction-mapper.ts`** - Maps Claude response to Actual Budget format

  - Validates transactions
  - Builds notes with bank context
  - Handles confidence scores

- **`pdf-adapter.web.ts`** - Main orchestrator for browser PDF processing
  - Calls `processPDFWithClaude()`
  - Validates completeness
  - Maps to `ParseFileResult`

**Key changes in `ImportTransactionsModal.tsx`:**

- Added `isPdfFile()` helper (line 1192)
- PDF files bypass date parsing (like OFX/CAMT)
- Dates from Claude are pre-formatted as `YYYY-MM-DD`

### Data Flow

```
1. User uploads PDF in browser
   ↓
2. pdf-adapter.web.ts receives file path
   ↓
3. claude-pdf-processor.ts reads PDF as binary
   ↓
4. Converts to Blob, creates FormData
   ↓
5. POST to http://localhost:4000/api/process-pdf
   ↓
6. Agent Server converts PDF to base64
   ↓
7. Sends to Claude API with document attachment
   ↓
8. Claude processes PDF natively, returns JSON:
   {
     "bankName": "Santander España",
     "accountNumber": "ES24...",
     "transactions": [
       {
         "date": "2025-07-17",
         "payee": "La Mina, Madrid",        // ✨ CURATED
         "notes": "Pago Movil En La Mina, Madrid",
         "amount": -41.80,
         "confidence": 0.95
       }
     ],
     "totalTransactionsFound": 28,
     "extractionComplete": true,
     "success": true
   }
   ↓
9. transaction-mapper.ts maps to Actual Budget format
   ↓
10. User reviews and imports transactions
```

### Payee Curation Examples

Claude Agent intelligently extracts merchant names:

| Raw Bank Description                                                    | Curated Payee             |
| ----------------------------------------------------------------------- | ------------------------- |
| `Fecha valor: 17/07/2025 Pago Movil En La Mina, Madrid, Tarj. :*536242` | `La Mina, Madrid`         |
| `Pago Movil En City Paseo Extr, Madrid`                                 | `City Paseo Extr, Madrid` |
| `Compra Loomisp*campo Del Moro, Madrid, Tarjeta 123`                    | `Loomisp, Madrid`         |
| `Transferencia desde Juan Pérez`                                        | `Juan Pérez`              |

### Environment Setup

**Production (Fly.io):**

- Actual Budget: https://actual-budget-sr.fly.dev (297 MB)
- Agent Server: https://actual-agent-sr.fly.dev (76 MB)
- API Key configured via Fly.io secrets

**Local Development:**

1. Anthropic API key in `.env`:

   ```bash
   VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
   ```

2. Start Agent Server:

   ```bash
   cd anthropic-pdf-agent
   yarn start  # Runs on http://localhost:4000
   ```

3. Start Actual Budget:
   ```bash
   yarn start:browser  # From root directory, runs on http://localhost:3001
   ```

### Supported Banks

Currently configured for:

- **Santander España** - Full transaction extraction with location-based payee curation
- **Revolut España** - International merchant names, multi-currency support

### Processing Capacity

- **Transactions per PDF**: 10-100 (tested up to 99 transactions)
- **PDF size limit**: 10 MB
- **Processing time**: 15-45 seconds depending on pages
- **Token optimization**: Compact JSON format to fit 100+ transactions in 8192 token limit

### Troubleshooting

**Agent Server not running:**

- Error: `Agent Server error (500): ECONNREFUSED`
- Solution: `cd anthropic-pdf-agent && yarn start`

**API key issues:**

- Error: `Your credit balance is too low`
- Solution: Add credits to Anthropic account at console.anthropic.com

**Date format errors:**

- Dates must be `YYYY-MM-DD`
- PDF files use `isPdfFile()` check to bypass date parsing
- See `ImportTransactionsModal.tsx:247, 603, 670`

**Low confidence extractions:**

- Check Agent Server logs for Claude's reasoning
- Transactions with confidence < 0.8 are flagged in notes
- Consider re-processing PDF with higher quality scan

### Logging and Debugging

**Agent Server logs** (console):

```
🚀 [Agent Server] New PDF processing request received
📄 [Agent Server] File: statement.pdf (245678 bytes)
📦 [Agent Server] PDF converted to base64: 327570 chars
🤖 [Agent] Sending PDF to Claude API with agent prompt...
✅ [Agent] Received response from Claude
📊 [Agent] Response type: text
📝 [Agent] Response length: 5432 chars
✨ [Agent] Parsed successfully:
   - Bank: Santander España
   - Transactions: 28
   - Complete: true
✅ [Agent Server] Response sent to client
```

**Browser logs** (console):

```
[Claude PDF Processor] Starting AGENT-based PDF processing: /path/to/file.pdf
[Claude PDF Processor] Agent Server: http://localhost:4000
[Claude PDF Processor] PDF file read successfully, size: 245678 bytes
[Claude PDF Processor] FormData prepared, sending to Agent Server...
[Claude PDF Processor] Agent Server response status: 200 OK
[Claude PDF Processor] Successfully parsed 28 transactions
[Claude PDF Processor] Bank: Santander España
```

### Future Enhancements

Potential improvements:

- [ ] Support for more Spanish banks (BBVA, CaixaBank, ING)
- [ ] Automatic bank detection from PDF content
- [ ] Transaction deduplication across multiple PDFs
- [ ] Historical payee learning for better curation
- [ ] Category learning from user corrections
- [ ] Multi-page PDF optimization
- [ ] Batch PDF processing
- [ ] Export Claude's reasoning for transparency

### References

- [Anthropic Agent Architecture](https://www.anthropic.com/engineering/building-effective-agents)
- [Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Claude API Docs](https://docs.anthropic.com/en/api/messages)
- [PDF Document Support](https://docs.anthropic.com/en/docs/build-with-claude/vision#document-support)

---

## 🆕 Phase 2: AI Category Suggestions (IN DEVELOPMENT)

### Status: 🚧 Implementation in Progress

This is **Agent 2** - an intelligent categorization system that learns from user's transaction history.

### Overview

**Problem Solved:** Agent 1 successfully extracts transactions from PDFs but doesn't suggest categories because:

- User categories are personal and unique (e.g., "Restaurantes" vs "Comida fuera" vs "Meals - Deductible")
- Agent 1 tried generic categories ("Restaurant") that didn't exist in user's database
- Need to learn from user's actual category structure + historical patterns

**Solution:** Agent 2 analyzes user's database BEFORE suggesting categories:

- Fetches user's actual categories
- Searches for similar transactions in history
- Applies active categorization rules
- Calls Claude only for uncertain cases (optimization)
- Returns: `{category, confidence, reasoning}`

### Architecture

```
Browser UI → Agent 2 (same server as Agent 1)
              ↓
         Fetch user context:
         - GET /api/categories/:accountId (NEW)
         - GET /api/transactions/search (NEW)
         - GET /api/rules/:accountId (NEW)
              ↓
         Decision logic:
         - Rule match? → Use rule (98% confidence)
         - 5+ historical matches? → Auto-categorize (95% confidence)
         - Uncertain? → Call Claude with context
              ↓
         Return: [{trx_id, category, confidence, reasoning}]
              ↓
         UI displays suggestions (opt-in button)
```

### Key Components

**Backend - New API Endpoints (Actual Budget):**

- `packages/loot-core/src/server/api/categories.ts` - Get user's categories
- `packages/loot-core/src/server/api/transactions.ts` - Search similar transactions (exact + fuzzy)
- `packages/loot-core/src/server/api/rules.ts` - Get active categorization rules

**Backend - Agent 2 (Agent Server):**

- `anthropic-pdf-agent/server.js` - Add new endpoint: `POST /api/suggest-categories`
- `anthropic-pdf-agent/categorization/search.js` - Search algorithms (exact → fuzzy → Levenshtein)
- `anthropic-pdf-agent/categorization/prompt.js` - Prompt engineering for categorization

**Frontend - UI (Actual Budget):**

- `packages/desktop-client/src/components/modals/ImportTransactionsModal/ImportTransactionsModal.tsx` - Add "Sugerir Categorías" button + display suggestions

### Testing

```bash
# Test new API endpoints (once implemented)
curl http://localhost:5006/api/categories/test-account-id
curl "http://localhost:5006/api/transactions/search?accountId=test&payee=La%20Mina"
curl "http://localhost:5006/api/transactions/search?accountId=test&payee=La%20Mina&fuzzy=true"
curl http://localhost:5006/api/rules/test-account-id

# End-to-end test
# 1. yarn start:browser (Actual Budget on :3001)
# 2. cd anthropic-pdf-agent && yarn dev (Agent on :4000)
# 3. Upload PDF → Import → Click "Sugerir Categorías"
# 4. Verify suggestions appear with confidence + reasoning
```

### Success Criteria (MVP)

- ✅ Accuracy >85% for known payees (tested with 10+ historical transactions)
- ✅ Accuracy >70% for new payees (based on Claude inference)
- ✅ Latency <5 seconds for 50 transactions
- ✅ User can accept/edit/ignore suggestions before importing

### Documentation

Detailed technical documentation:

- **Product Spec:** `F2_CATEGORY_AGENT/PHASE_2_PRODUCT_SPEC.md`
- **Technical Plan:** `F2_CATEGORY_AGENT/PHASE_2_TECHNICAL_PLAN.md`
- **Architecture Diagrams:** `F2_CATEGORY_AGENT/PHASE_2_DIAGRAMS.md`
- **Project Context:** `PROJECT_DOCUMENTATION.md`

### Key Differences: Agent 1 vs Agent 2

| Aspect           | Agent 1 (PDF Parser)             | Agent 2 (Categorizer)                  |
| ---------------- | -------------------------------- | -------------------------------------- |
| **Input**        | PDF file                         | Transactions array                     |
| **Context**      | None (reads PDF only)            | User's DB (categories, history, rules) |
| **Claude Usage** | Always (for PDF vision)          | Conditional (only uncertain cases)     |
| **Output**       | Transactions with curated payees | Category suggestions with confidence   |
| **Endpoint**     | `/api/process-pdf`               | `/api/suggest-categories`              |
| **Status**       | ✅ Production                    | 🚧 In Development                      |

---

## Custom Workspace: MASTRA-PDF-IMPORTER (Deprecated)

⚠️ **This workspace is deprecated and not used in the current PDF import implementation.**

The current implementation uses the Anthropic Agent Server architecture described above, not Mastra.

---

## Important Instruction Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
