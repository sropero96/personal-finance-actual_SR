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
- Supports multiple formats: OFX, QFX, CSV, QIF, **PDF** (via AI agent)
- Extensible parser system with format detection
- Custom parsers per bank (e.g., `parse-file.ts` contains bank-specific logic)
- **PDF Import**: Uses Mastra AI agent for extracting transactions from bank statement PDFs

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

| Package | Purpose |
|---------|---------|
| `loot-core` | Core business logic engine |
| `@actual-app/web` (desktop-client) | React frontend |
| `desktop-electron` | Electron desktop wrapper |
| `@actual-app/sync-server` | Optional sync server |
| `@actual-app/api` | External programmatic API |
| `@actual-app/crdt` | CRDT data structures |
| `@actual-app/components` (component-library) | Shared React components |

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

## PDF Import Feature (Experimental)

### Overview
Actual Budget now supports importing bank statement PDFs using an AI-powered agent built with Mastra framework. This feature currently supports **Santander España** and **Revolut España** bank statements.

### Architecture
```
User selects PDF → Actual UI → loot-core (parse-file.ts) →
pdf-adapter.ts → HTTP POST :5055/extract →
MASTRA-PDF-IMPORTER/server.ts → Mastra Agent API :4112 →
pdfExtractorAgent (GPT-4o-mini) → Parsed Transactions →
Import into Actual Budget
```

### Setup Requirements

1. **Environment Variables** (`.env` in root directory):
   ```bash
   PDF_AGENT_HTTP_URL=http://localhost:5055
   # Optional: Disable PDF import
   # ACTUAL_PDF_AGENT_DISABLED=1
   ```

2. **Mastra PDF Service** (`MASTRA-PDF-IMPORTER/`):
   - OpenAI API key required (`OPENAI_API_KEY` in `MASTRA-PDF-IMPORTER/.env`)
   - Start service: `cd MASTRA-PDF-IMPORTER && ./start-pdf-service.sh`
   - Runs on ports 4112 (Mastra API) and 5055 (HTTP wrapper)

### Development Workflow

#### Starting the PDF Service
```bash
cd MASTRA-PDF-IMPORTER
./start-pdf-service.sh
# Or manually:
# Terminal 1: npm run dev (Mastra on :4112)
# Terminal 2: npm run server (HTTP wrapper on :5055)
```

#### Starting Actual Budget
```bash
# From repo root
yarn start:browser
```

### Code Locations

| Component | Path | Description |
|-----------|------|-------------|
| Parser registration | `packages/loot-core/src/server/transactions/import/parse-file.ts` | Registers `.pdf` extension |
| PDF adapter | `packages/loot-core/src/server/transactions/import/pdf-adapter.ts` | HTTP client to Mastra agent |
| UI file picker | `packages/desktop-client/src/components/modals/ImportTransactionsModal/ImportTransactionsModal.tsx` | Adds `.pdf` to accepted files |
| Mastra agent | `MASTRA-PDF-IMPORTER/src/mastra/agents/pdf-extractor-agent.ts` | AI agent definition |
| HTTP wrapper | `MASTRA-PDF-IMPORTER/src/server.ts` | Express server wrapping Mastra API |
| Santander parser | `MASTRA-PDF-IMPORTER/src/mastra/tools/santander-parser-v2.ts` | Santander España parser |
| Revolut parser | `MASTRA-PDF-IMPORTER/src/mastra/tools/revolut-parser.ts` | Revolut España parser |

### Supported Banks
- **Santander España**: Extractos de cuenta corriente (formato estándar)
- **Revolut**: Statements in EUR, USD, GBP

### Adding Support for New Banks

1. Create a new parser tool in `MASTRA-PDF-IMPORTER/src/mastra/tools/`:
   ```typescript
   import { createTool } from '@mastra/core/tools';
   import { z } from 'zod';

   export const myBankParserTool = createTool({
     id: 'my-bank-parser',
     description: 'Parse My Bank PDF statements',
     inputSchema: z.object({
       rawText: z.string(),
     }),
     outputSchema: z.object({
       bankName: z.string(),
       transactions: z.array(z.object({
         date: z.string(),
         amount: z.number(),
         description: z.string(),
         balance: z.number(),
       })),
       totalTransactions: z.number(),
       success: z.boolean(),
     }),
     execute: async ({ context }) => {
       // Your parsing logic
     },
   });
   ```

2. Register the tool in `MASTRA-PDF-IMPORTER/src/mastra/agents/pdf-extractor-agent.ts`:
   ```typescript
   tools: {
     saveFileTool,
     pdfReaderTool,
     santanderParserTool,
     revolutParserTool,
     myBankParserTool, // Add here
   }
   ```

### Testing

```bash
# Run PDF adapter tests
yarn workspace loot-core run test src/server/transactions/import/pdf-adapter.test.ts --watch=false
```

### Troubleshooting

**Error: "PDF_AGENT_HTTP_URL not configured"**
- Ensure `.env` exists in root directory with `PDF_AGENT_HTTP_URL=http://localhost:5055`

**Error: "PDF extraction failed"**
- Check that Mastra service is running: `curl http://localhost:5055`
- Check that Mastra API is running: `curl http://localhost:4112`
- Review logs in `MASTRA-PDF-IMPORTER/` (if using the start script, check `/tmp/mastra-*.log`)

**Error: "HTTP 500" from agent**
- Verify OpenAI API key is configured in `MASTRA-PDF-IMPORTER/.env`
- Check Mastra logs for details

**No transactions extracted**
- Verify the PDF is from a supported bank (Santander or Revolut España)
- The PDF must be a native digital PDF, not a scanned image

### Disabling PDF Import

Set environment variable in `.env`:
```bash
ACTUAL_PDF_AGENT_DISABLED=1
```

### Custom Workspace: MASTRA-PDF-IMPORTER
This workspace contains the PDF import functionality using AI agents to parse bank statement PDFs. It uses the Mastra framework for agent orchestration. See `MASTRA-PDF-IMPORTER/README-INTEGRATION.md` for detailed setup and usage instructions.