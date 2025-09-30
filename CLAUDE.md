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
- Supports multiple formats: OFX, QFX, CSV, QIF
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

### Custom Workspace: MASTRA-PDF-IMPORTER
This workspace contains experimental PDF import functionality using AI agents to parse bank statement PDFs. It uses the Mastra framework for agent orchestration.