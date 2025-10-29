# Deployment Analysis & Architecture Report

## Actual Budget + Claude AI PDF Importer - Fly.io Deployment Issues

**Date:** October 14, 2025
**Status:** 🔴 CRITICAL - Production Server Non-Functional
**Root Cause:** Multiple architecture issues with Yarn Workspaces + Docker deployment

---

## Executive Summary

The production deployment on Fly.io is currently failing due to a series of cascading issues related to:

1. Yarn workspace dependency resolution in Docker
2. Missing workspace package symlinks in production
3. Protobuf file generation/copying issues in the @actual-app/crdt package
4. CommonJS/ESM module loading conflicts

**Impact:** The sync server crashes immediately on startup, making the entire application unusable in production.

---

## Timeline of Issues & Fixes

### Issue 1: "Failed to fetch" - PDF Import Not Working

**Date:** October 14, 2025 (Initial)
**Symptom:** Frontend loads but PDF import fails with "Failed to fetch"
**Root Cause:** Frontend code was hardcoded to connect to `localhost:4000` instead of production Agent Server URL

**Analysis:**

- Code used `process.env.ANTHROPIC_AGENT_URL || 'http://localhost:4000'`
- `process.env.NODE_ENV` is unreliable in browser context
- Agent server was also auto-stopping after inactivity

**Fix Applied:**

```typescript
// claude-pdf-processor.ts & agent2-service.ts
const isProduction =
  process.env.NODE_ENV === 'production' ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost');

const agentServerUrl = isProduction
  ? 'https://actual-agent-sr.fly.dev'
  : 'http://localhost:4000';
```

**Config Fix:**

```toml
# fly.agent.toml
min_machines_running = 1  # Was 0, caused auto-stop
```

**Status:** ✅ RESOLVED
**Commits:**

- `702aaa02` - Environment detection fix
- `b96aa504` - Agent server configuration fix

---

### Issue 2: ERR_MODULE_NOT_FOUND - 'migrate' Package

**Symptom:** Server crashes with `Cannot find package 'migrate'`
**Root Cause:** Yarn workspace hoisting - dependencies in `/app/node_modules`, not in package-specific directories

**Technical Details:**

```
Yarn Workspaces Architecture (Development):
/app/
├── node_modules/           ← Dependencies hoisted here
│   ├── migrate/
│   └── @actual-app/
│       ├── crdt → ../../packages/crdt (symlink)
│       └── web → ../../packages/desktop-client (symlink)
├── packages/
│   ├── crdt/
│   ├── sync-server/
│   └── desktop-client/
```

**Docker Problem:**
Original Dockerfile only copied:

```dockerfile
COPY --from=builder /app/packages/sync-server/node_modules ./packages/sync-server/node_modules
```

This missed all hoisted dependencies!

**Fix Applied:**

```dockerfile
# Copy root node_modules (contains hoisted dependencies)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.yarnrc.yml ./.yarnrc.yml

# Run from /app (not /app/packages/sync-server/build)
# This allows Node.js to find /app/node_modules
cd /app || exit 1
exec node packages/sync-server/build/app.js
```

**Status:** ✅ RESOLVED
**Commit:** `0d0f79ad` - Working directory fix

---

### Issue 3: ERR_MODULE_NOT_FOUND - '@actual-app/crdt'

**Symptom:** Server crashes with `Cannot find package '@actual-app/crdt'`
**Root Cause:** Workspace packages need symlinks in production, just like in development

**Analysis:**

```bash
# Development (Yarn creates these automatically):
/app/node_modules/@actual-app/crdt → /app/packages/crdt

# Production (We must create manually):
/app/packages/sync-server/node_modules/@actual-app/crdt → /app/packages/crdt
```

**Fix Applied:**

```dockerfile
# Build CRDT package
RUN yarn workspace @actual-app/crdt build

# Copy built CRDT dist to production image
COPY --from=builder /app/packages/crdt/dist ./packages/crdt/dist
COPY --from=builder /app/packages/crdt/package.json ./packages/crdt/package.json

# Create symlinks for workspace packages
RUN mkdir -p /app/packages/sync-server/node_modules/@actual-app && \
    ln -s /app/packages/desktop-client /app/packages/sync-server/node_modules/@actual-app/web && \
    ln -s /app/packages/crdt /app/packages/sync-server/node_modules/@actual-app/crdt
```

**Status:** ✅ RESOLVED
**Commit:** `4f5c5492`, `0d0f79ad` - CRDT package & symlink creation

---

### Issue 4: 🔴 CRITICAL - Protobuf Loading Error

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'SyncRequest')`
**Root Cause:** Complex - protobuf file generation/loading issues

**Error Details:**

```
/app/packages/crdt/dist/src/index.js:16
exports.SyncRequest = globalThis.proto.SyncRequest;
                                       ^
TypeError: Cannot read properties of undefined (reading 'SyncRequest')
```

**Deep Investigation:**

1. **File Structure:**

   ```
   /app/packages/crdt/
   ├── src/proto/sync_pb.js    ← 34KB generated protobuf (committed to git)
   └── dist/src/proto/sync_pb.js  ← Should be copied from src
   ```

2. **Build Process Issue:**

   - TypeScript build (`tsc`) compiles `.ts` → `.js`
   - TypeScript does NOT copy existing `.js` files (like sync_pb.js)
   - Original sync_pb.js (34KB) gets replaced with a 162-byte stub

3. **Fix Attempted:**

   ```dockerfile
   RUN yarn workspace @actual-app/crdt build && \
       cp packages/crdt/src/proto/sync_pb.js packages/crdt/dist/src/proto/sync_pb.js
   ```

4. **Verification:**

   ```bash
   # ✅ File copied correctly - 35KB in production
   $ fly ssh console -C "ls -lh /app/packages/crdt/dist/src/proto/sync_pb.js"
   -rw-r--r-- 1 root root 35K Oct 14 11:43 sync_pb.js

   # ✅ File content is correct
   $ fly ssh console -C "head -20 sync_pb.js"
   var jspb = require('google-protobuf');
   var goog = jspb;
   var global = globalThis;
   goog.exportSymbol('proto.SyncRequest', null, global);
   ...

   # ✅ Manual loading works!
   $ node -e "require('./packages/crdt/dist/src/proto/sync_pb.js'); console.log(typeof globalThis.proto);"
   object

   # ✅ Direct crdt import works!
   $ node -e "const crdt = require('./packages/crdt/dist/src/index'); console.log(Object.keys(crdt));"
   [ 'merkle', 'getClock', ... 'SyncRequest', 'SyncResponse', ... ]

   # ❌ BUT app startup STILL fails!
   ```

5. **Hypothesis:**
   - File is correct ✅
   - Manual loading works ✅
   - App startup fails ❌
   - Possible causes:
     - Module loading order issue
     - ESM vs CommonJS conflict
     - Node.js caching issue
     - Different execution context in app.js

**Status:** 🔴 UNRESOLVED
**Commits:** `7f1fc043` - Protobuf copy fix (not sufficient)

---

## Architecture Problems Identified

### 1. Monolithic Deployment (Frontend + Backend)

**Problem:** Single Docker image contains both frontend and backend, increasing complexity

**Current Architecture:**

```
┌────────────────────────────────────────────────────┐
│  Single Fly.io Machine (299 MB)                   │
│                                                    │
│  ┌──────────────┐      ┌──────────────────────┐  │
│  │  Frontend    │      │  Sync Server         │  │
│  │  (React)     │      │  (Node.js + Express) │  │
│  │  980KB gzip  │      │  Yarn Workspaces     │  │
│  └──────────────┘      └──────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────┐    │
│  │  Agent Server (PDF Processing)           │    │
│  │  Node.js + Anthropic SDK                 │    │
│  └──────────────────────────────────────────┘    │
└────────────────────────────────────────────────────┘
```

**Issues:**

- Cannot scale frontend and backend independently
- Complex Yarn workspace symlink management in Docker
- Large image size (299 MB) for what should be simple deployments
- Difficult to debug - everything mixed together

### 2. Yarn Workspaces in Docker

**Problem:** Yarn's dependency hoisting doesn't translate cleanly to Docker

**Yarn Workspace Concepts:**

```javascript
// Development (Yarn manages this):
node_modules/@actual-app/crdt → symlink to ../../packages/crdt

// Production (We must manually recreate):
1. Copy all workspace packages
2. Copy hoisted node_modules
3. Create symlinks manually
4. Ensure working directory is correct
```

**Manual Steps Required:**

1. Build each workspace package
2. Copy package.json files
3. Copy built artifacts (dist directories)
4. Copy root node_modules (hoisted dependencies)
5. Create symlinks for internal workspace references
6. Set correct working directory for Node.js resolution

**This is fragile and error-prone!**

### 3. CommonJS + ESM Module System Mix

**Problem:** The codebase mixes CommonJS and ES Modules

```javascript
// crdt uses CommonJS
module.exports = { ... }

// sync-server uses ES Modules
import { ... } from '@actual-app/crdt'

// But TypeScript compiles to CommonJS
"module": "CommonJS"
```

**Issues:**

- Module resolution differences
- Timing issues with `require()` vs `import`
- `globalThis` pollution (protobuf relies on this)
- Hard to debug module loading order

### 4. Generated Code (Protobuf) Not Handled Properly

**Problem:** sync_pb.js is generated code but treated as source

**Current Flow:**

```
1. Developer runs: yarn workspace @actual-app/crdt proto:generate
2. Generates: packages/crdt/src/proto/sync_pb.js (34KB)
3. File is committed to git
4. TypeScript build: tsc --outDir dist
5. TypeScript sees sync_pb.js and creates empty stub
6. Original 34KB file is lost!
```

**Better Approaches:**

1. **Option A:** Exclude proto files from TypeScript compilation
2. **Option B:** Generate proto files during Docker build
3. **Option C:** Bundle crdt package completely (no external dependencies)

---

## Recommended Solutions

### Short-Term Fix (Emergency)

**Goal:** Get production working ASAP

**Option 1: Rollback to Last Working Version**

```bash
# Find last working deployment
fly releases -a actual-budget-sr

# Rollback
fly releases rollback v<number> -a actual-budget-sr
```

**Option 2: Remove Agent 2 (Category Suggester) Feature**
This was the feature being added when issues started. Remove it temporarily:

- Revert commits related to Agent 2
- Keep Agent 1 (PDF importer) which was working
- Deploy simpler version

**Option 3: Use Pre-built Upstream Image**
If available, use official Actual Budget Docker image:

```bash
# Use upstream actual-server
docker pull actualbudget/actual-server:latest
```

### Medium-Term Solution (1-2 weeks)

**Goal:** Proper architecture with separated concerns

**Recommended Architecture:**

```
┌─────────────────────────┐
│   CDN (Vercel/Netlify) │  ← Frontend only (static files)
│   Static React App      │     ~1MB gzipped
│   instant deployment    │     Global CDN
└──────────┬──────────────┘
           │
           │ HTTPS
           ▼
┌─────────────────────────┐
│ Actual Sync Server      │  ← Backend only (minimal Docker)
│ Fly.io (50-100 MB)      │     Just Node.js + Express
│ Single workspace only   │     No frontend complexity
└──────────┬──────────────┘
           │
           │ Internal Network
           ▼
┌─────────────────────────┐
│ Agent Server            │  ← AI Features (already separated!)
│ Fly.io (76 MB)          │     Anthropic SDK
│ PDF + Categorization    │     Independent scaling
└─────────────────────────┘
```

**Benefits:**

- **Frontend:** Deploy to Vercel/Netlify for free, instant global CDN
- **Sync Server:** Smaller Docker image (~50MB), simpler Dockerfile
- **Agent Server:** Already separated ✅
- **Independent scaling:** Scale each service based on demand
- **Easier debugging:** Clear separation of concerns
- **Faster deployments:** Frontend changes don't require Docker rebuild

**Implementation Steps:**

1. **Split Dockerfile.production into two:**

   ```dockerfile
   # Dockerfile.frontend (not needed if using Vercel)
   FROM nginx:alpine
   COPY packages/desktop-client/build /usr/share/nginx/html

   # Dockerfile.backend
   FROM node:20-slim
   # Only sync-server dependencies
   COPY packages/sync-server ./server
   CMD ["node", "server/app.js"]
   ```

2. **Simplify sync-server deployment:**

   ```bash
   # Use yarn workspaces focus to install only sync-server deps
   yarn workspaces focus @actual-app/sync-server --production
   ```

3. **Frontend deployment to Vercel:**
   ```json
   // vercel.json
   {
     "buildCommand": "yarn workspace @actual-app/web build",
     "outputDirectory": "packages/desktop-client/build"
   }
   ```

### Long-Term Solution (1-3 months)

**Goal:** Modern, scalable architecture

**Option 1: Containerize Each Workspace**
Create separate Docker images for each package:

- `@actual-app/web` → Static site
- `@actual-app/sync-server` → API server
- `anthropic-pdf-agent` → AI agent (already done ✅)

**Option 2: Migrate to Serverless**
Use Cloudflare Workers or Vercel Edge Functions:

```
Frontend: Static (Vercel/Cloudflare Pages)
API: Cloudflare Workers (sync-server logic)
Database: Fly.io Postgres or Cloudflare D1
Agents: Cloudflare Workers + AI binding
```

**Benefits:**

- Near-zero cold start
- Auto-scaling
- Pay per request
- Global edge deployment
- Simpler deployment (no Docker)

**Option 3: Monorepo with NX/Turborepo**
Use modern monorepo tools that handle Docker better:

```bash
# NX example
nx build sync-server --with-deps
nx docker-build sync-server
```

---

## Cost Analysis

### Current (Monolithic)

- **Actual Budget (frontend + sync-server):** $5-10/month (Fly.io)
- **Agent Server:** $3-5/month (Fly.io)
- **Total:** ~$8-15/month
- **Issues:** Complex deployments, high maintenance

### Recommended (Separated)

- **Frontend (Vercel/Netlify):** $0 (free tier)
- **Sync Server (Fly.io):** $3-5/month (smaller image)
- **Agent Server (Fly.io):** $3-5/month (existing)
- **Total:** ~$6-10/month
- **Benefits:** Simpler, more reliable, easier to debug

---

## Technical Debt Identified

1. **No Integration Tests for Deployment**

   - Need automated tests that verify production deployments
   - Test Docker build locally before deploying
   - Add smoke tests post-deployment

2. **Manual Dependency Management**

   - Yarn workspace symlinks created manually in Dockerfile
   - Should use `yarn workspaces focus` or similar
   - Consider migrating to pnpm (better Docker support)

3. **Mixed Module Systems**

   - CommonJS in some packages, ESM in others
   - Pick one and stick to it
   - Or use a bundler to eliminate the issue

4. **No Deployment Rollback Strategy**

   - Need automatic rollback on health check failures
   - Implement blue-green deployments
   - Keep last 3 working versions readily available

5. **Insufficient Logging**

   - More structured logging needed
   - Add deployment version tracking
   - Implement distributed tracing (OpenTelemetry)

6. **Protobuf File Management**
   - Generated files committed to git (not ideal)
   - Should regenerate during build OR
   - Bundle completely to avoid runtime loading

---

## Immediate Action Items

### Priority 1 (Today) - Get Production Working

- [ ] Decision: Rollback vs. Fix vs. Remove Feature
- [ ] If rollback: Identify last working version
- [ ] If fix: Focus on protobuf loading issue
- [ ] If remove: Revert Agent 2 commits

### Priority 2 (This Week) - Prevent Future Issues

- [ ] Add Docker build verification in CI/CD
- [ ] Create staging environment for testing
- [ ] Document deployment process
- [ ] Add health check endpoints to all services

### Priority 3 (Next Week) - Architecture Improvements

- [ ] Evaluate frontend deployment to Vercel/Netlify
- [ ] Simplify sync-server Dockerfile
- [ ] Create separate Docker images for each service
- [ ] Implement proper monitoring and alerting

---

## Lessons Learned

1. **Yarn Workspaces + Docker is Hard**

   - Requires deep understanding of hoisting and module resolution
   - Manual symlink creation is error-prone
   - Consider alternatives (pnpm, separate repos, monorepo tools)

2. **Test Deployments Locally First**

   - Use `fly deploy --local-only` for testing
   - Verify Docker image works before production
   - Run smoke tests after deployment

3. **Separate Concerns Early**

   - Don't mix frontend and backend in same container
   - Each service should have single responsibility
   - Make services independently deployable

4. **Generated Code Needs Special Handling**

   - Don't commit generated files (protobuf) if they change
   - OR commit them but exclude from build processes
   - OR generate during build consistently

5. **Module Systems Matter**
   - CommonJS vs. ESM affects everything
   - Pick one and be consistent
   - Use bundlers to eliminate ambiguity

---

## Conclusion

The current deployment has **critical architectural issues** that make it fragile and difficult to maintain. While short-term patches can get production working, a proper solution requires **architectural refactoring**:

1. **Separate frontend and backend deployments**
2. **Simplify Docker images (one service per image)**
3. **Use modern deployment platforms where appropriate**
4. **Eliminate manual dependency management**

The recommended approach is:

- **Short-term:** Rollback to working version
- **Medium-term:** Deploy frontend to Vercel, keep backend on Fly.io
- **Long-term:** Consider serverless architecture for better scalability

**Estimated Effort:**

- Emergency fix: 1-2 hours
- Architecture refactor: 1-2 weeks
- Full modernization: 1-3 months

---

## Appendix: Commands Used During Investigation

### Fly.io Commands

```bash
# Deploy
fly deploy -a actual-budget-sr

# Check status
fly status -a actual-budget-sr

# View logs
fly logs -a actual-budget-sr
fly logs -a actual-budget-sr --no-tail

# SSH into container
fly ssh console -a actual-budget-sr -C "command"

# Start/stop machine
fly machine start <machine-id> -a actual-budget-sr
fly machine stop <machine-id> -a actual-budget-sr

# Check health
fly checks list -a actual-budget-sr
```

### Debugging Commands

```bash
# Check file in container
fly ssh console -a actual-budget-sr -C "ls -lh /app/packages/crdt/dist/src/proto/sync_pb.js"
fly ssh console -a actual-budget-sr -C "head -20 /app/packages/crdt/dist/src/proto/sync_pb.js"

# Test module loading
fly ssh console -a actual-budget-sr -C "node -e \"require('./packages/crdt/dist/src/proto/sync_pb.js'); console.log(typeof globalThis.proto);\""

# Check node_modules
fly ssh console -a actual-budget-sr -C "ls -la /app/node_modules/google-protobuf/"
```

### Local Testing Commands

```bash
# Build workspace
yarn workspace @actual-app/crdt build
yarn workspace @actual-app/sync-server build

# Check built files
ls -lh packages/crdt/dist/src/proto/sync_pb.js

# Test import locally
node -e "const crdt = require('./packages/crdt/dist/src/index'); console.log(Object.keys(crdt));"
```

---

**Report Prepared By:** Claude Code (Anthropic AI)
**Version:** 1.0
**Last Updated:** October 14, 2025
