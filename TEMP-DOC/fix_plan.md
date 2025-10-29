# Fix Plan: Agent Recovery & Improvement

**Generated:** 2025-10-28
**Target Completion:** 2025-11-01
**Total Estimated Effort:** 16-20 hours

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Root Causes Confirmed](#root-causes-confirmed)
3. [Quick Wins (Completed)](#quick-wins-completed)
4. [Phase 1: Agent 2 Core Fixes (P0)](#phase-1-agent-2-core-fixes-p0)
5. [Phase 2: Build & Module Resolution (P1)](#phase-2-build--module-resolution-p1)
6. [Phase 3: Test Coverage (P1)](#phase-3-test-coverage-p1)
7. [Phase 4: Code Quality & Cleanup (P2)](#phase-4-code-quality--cleanup-p2)
8. [Future Enhancements](#future-enhancements)
9. [Rollback Plan](#rollback-plan)

---

## Executive Summary

### Current Status

| Component                        | Status                  | Next Action       |
| -------------------------------- | ----------------------- | ----------------- |
| **Agent 1 (PDF Parser)**         | ✅ **FULLY FUNCTIONAL** | Add tests         |
| **Agent 2 (Category Suggester)** | ⚠️ **BLOCKED**          | Fix payee lookup  |
| **Agent Server**                 | ✅ **OPERATIONAL**      | No changes needed |
| **Test Coverage**                | ❌ **MISSING**          | Add e2e tests     |
| **Code Quality**                 | ⚠️ **NEEDS CLEANUP**    | Run lint:fix      |

### Priority Breakdown

- **P0 (Critical):** 1 task group - Agent 2 payee lookup fix
- **P1 (High):** 2 task groups - Module resolution + Test coverage
- **P2 (Medium):** 1 task group - Code quality cleanup

---

## Root Causes Confirmed

### ✅ Agent 1: Category Field Type Violation (RESOLVED)

**Problem:** The `category` field was added to transaction output but didn't exist in the `Transaction` type.

**Evidence:**

- Commit `bc23190c` (Oct 2, 2025): Initial implementation with category field
- Commit `1848e53f` (Oct 9, 2025): Documentation said to remove it, but code wasn't updated
- TypeScript errors: `pdf-adapter.web.ts:97`, `transaction-mapper.ts:118`

**Resolution Applied (Oct 28, 2025):**

- ✅ Removed `category` field from `transaction-mapper.ts:111-122`
- ✅ Made `category` optional in `ClaudeTransaction` type
- ✅ Removed `category` from debug log in `pdf-adapter.web.ts:93-98`

**Verification:**

```bash
yarn typecheck | grep -E "pdf-adapter|transaction-mapper|claude-pdf-processor"
# Expected: No errors related to 'category' field
```

### ⚠️ Agent 2: Payee Name Lookup Issue (OPEN)

**Problem:** Code assumes `TransactionEntity.payee_name` exists, but it doesn't.

**Evidence:**

- `useAgent2Context.ts` lines 55, 56, 137, 148, 238, 248 all reference `tx.payee_name`
- Actual type: `TransactionEntity` has `payee?: PayeeEntity['id']` (an ID, not a name)
- Alternative: `imported_payee?: string` exists and contains the name

**Root Cause:** Agent 2 was developed without checking the actual TypeScript type definitions.

---

## Quick Wins (Completed)

### ✅ Task Group 1: Agent 1 Category Fix

| ID   | Task                                                      | Status  | Effort | Completed    |
| ---- | --------------------------------------------------------- | ------- | ------ | ------------ |
| A1.1 | Remove `category` field from `transaction-mapper.ts`      | ✅ DONE | 5 min  | Oct 28, 2025 |
| A1.2 | Update `ClaudeTransaction` type to make category optional | ✅ DONE | 5 min  | Oct 28, 2025 |
| A1.3 | Remove `category` from debug log in `pdf-adapter.web.ts`  | ✅ DONE | 5 min  | Oct 28, 2025 |
| A1.4 | Verify TypeScript compilation                             | ✅ DONE | 2 min  | Oct 28, 2025 |

**Total Time:** 17 minutes
**Owner:** Claude Code
**Acceptance Criteria:** ✅ All met

- Agent 1 compiles without category-related errors
- PDF import flow still works correctly
- No runtime errors

---

## Phase 1: Agent 2 Core Fixes (P0)

**Priority:** CRITICAL - Blocks Agent 2 testing
**Estimated Effort:** 4-6 hours
**Dependencies:** None
**Owner:** TBD

### Task Group 2: Fix Payee Lookup in useAgent2Context.ts

| ID       | Task                                                                | Effort | Acceptance Criteria                                                    |
| -------- | ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| **A2.1** | Replace `tx.payee_name` with `tx.imported_payee` throughout file    | 30 min | All 6 occurrences fixed (lines 55, 56, 137, 148, 238, 248)             |
| **A2.2** | Add fallback logic: `tx.imported_payee \|\| payeeMap.get(tx.payee)` | 45 min | Works for both imported and manually entered transactions              |
| **A2.3** | Implement payee name lookup utility function                        | 1 hour | Function: `getPayeeName(tx: TransactionEntity, payees: PayeeEntity[])` |
| **A2.4** | Update historical transaction grouping logic                        | 30 min | Correctly groups by payee name, not undefined                          |
| **A2.5** | Fix type error on line 75: `useQuery` expects function              | 15 min | Wrap query in arrow function or fix call                               |
| **A2.6** | Fix type error on line 98: Same issue                               | 15 min | Consistent with A2.5 fix                                               |
| **A2.7** | Test with sample data (manual)                                      | 1 hour | Agent 2 returns valid suggestions                                      |

**Total Effort:** 4 hours 15 minutes

#### Detailed Implementation: A2.1 - A2.4

**File:** `packages/desktop-client/src/hooks/useAgent2Context.ts`

**Step 1:** Create payee name utility (A2.3)

```typescript
// Add at top of file after imports
function getPayeeName(tx: TransactionEntity, payees: PayeeEntity[]): string {
  // Option 1: Use imported_payee if available (from import flow)
  if (tx.imported_payee) {
    return tx.imported_payee;
  }

  // Option 2: Look up payee name from payees table
  if (tx.payee) {
    const payee = payees.find(p => p.id === tx.payee);
    if (payee) {
      return payee.name;
    }
  }

  // Fallback: Return payee ID as string
  return tx.payee || 'Unknown';
}
```

**Step 2:** Update payeeFilters logic (A2.1)

```typescript
// Lines 50-63 - BEFORE
const payeeFilters = useMemo(() => {
  const payeeNames = new Set<string>();
  const payeeIds = new Set<string>();

  transactions.forEach(tx => {
    if (tx.payee_name) payeeNames.add(tx.payee_name); // ❌ WRONG
    if (tx.payee) payeeIds.add(tx.payee);
  });

  return {
    names: Array.from(payeeNames),
    ids: Array.from(payeeIds),
  };
}, [transactions]);

// Lines 50-67 - AFTER
const payeeFilters = useMemo(() => {
  const payeeNames = new Set<string>();
  const payeeIds = new Set<string>();

  transactions.forEach(tx => {
    if (tx.imported_payee) payeeNames.add(tx.imported_payee); // ✅ CORRECT
    if (tx.payee) payeeIds.add(tx.payee);
  });

  return {
    names: Array.from(payeeNames),
    ids: Array.from(payeeIds),
  };
}, [transactions]);
```

**Step 3:** Update historical transaction mapping (A2.4)

```typescript
// Lines 124-158 - BEFORE
const historicalTransactions = useMemo(() => {
  if (!historicalData || !categoriesData) return [];

  const grouped = new Map<string, Agent2HistoricalTransaction>();

  historicalData.forEach(tx => {
    if (!tx.category) return;

    const category = categoriesData.find(cat => cat.id === tx.category);
    if (!category) return;

    const key = `${tx.payee || tx.payee_name}|${tx.category}`; // ❌ WRONG
    const existing = grouped.get(key);

    if (existing) {
      existing.frequency = (existing.frequency || 1) + 1;
      if (tx.date > existing.date) {
        existing.date = tx.date;
      }
    } else {
      grouped.set(key, {
        payeeName: tx.payee_name || '', // ❌ WRONG
        categoryName: category.name,
        category: tx.category,
        date: tx.date || '',
        frequency: 1,
      });
    }
  });

  return Array.from(grouped.values());
}, [historicalData, categoriesData]);

// Lines 124-165 - AFTER
const historicalTransactions = useMemo(() => {
  if (!historicalData || !categoriesData || !payees) return [];

  const grouped = new Map<string, Agent2HistoricalTransaction>();

  historicalData.forEach(tx => {
    if (!tx.category) return;

    const category = categoriesData.find(cat => cat.id === tx.category);
    if (!category) return;

    // Use utility function to get payee name
    const payeeName = getPayeeName(tx, payees);
    const key = `${payeeName}|${tx.category}`; // ✅ CORRECT
    const existing = grouped.get(key);

    if (existing) {
      existing.frequency = (existing.frequency || 1) + 1;
      if (tx.date > existing.date) {
        existing.date = tx.date;
      }
    } else {
      grouped.set(key, {
        payeeName: payeeName, // ✅ CORRECT
        categoryName: category.name,
        category: tx.category,
        date: tx.date || '',
        frequency: 1,
      });
    }
  });

  return Array.from(grouped.values());
}, [historicalData, categoriesData, payees]);
```

**Step 4:** Fix useQuery type issues (A2.5, A2.6)

```typescript
// Line 74 - BEFORE
const {
  data: rulesData,
  isLoading: rulesLoading,
  error: rulesError,
} = useQuery<RuleEntity>(rulesQuery, []); // ❌ WRONG - expects function

// Line 74 - AFTER
const {
  data: rulesData,
  isLoading: rulesLoading,
  error: rulesError,
} = useQuery<RuleEntity>(() => rulesQuery, []); // ✅ CORRECT

// Line 97 - BEFORE
const {
  data: historicalData,
  isLoading: historicalLoading,
  error: historicalError,
} = useQuery<TransactionEntity>(historicalQuery, [historicalQuery]); // ❌ WRONG

// Line 97 - AFTER
const {
  data: historicalData,
  isLoading: historicalLoading,
  error: historicalError,
} = useQuery<TransactionEntity>(() => historicalQuery, [historicalQuery]); // ✅ CORRECT
```

#### Acceptance Criteria for Task Group 2

- [ ] All TypeScript errors in `useAgent2Context.ts` resolved
- [ ] No references to non-existent `payee_name` field
- [ ] Payee names correctly extracted using `imported_payee` or lookup
- [ ] Historical transaction grouping works correctly
- [ ] Manual test: Agent 2 suggests categories for 10 sample transactions
- [ ] Manual test: Suggestions match historical patterns (>85% accuracy)

### Task Group 3: Fix Agent 2 UI Type Errors

| ID        | Task                                                              | Effort | Acceptance Criteria                                   |
| --------- | ----------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| **A2.8**  | Add 'ai-categorize' to modal type union in `Account.tsx`          | 15 min | Type error resolved at line 776                       |
| **A2.9**  | Update `Modals.tsx` to handle 'ai-categorize' case                | 15 min | Type error resolved at line 123                       |
| **A2.10** | Fix `AICategorizeModal.tsx` prop names: `disabled` → `isDisabled` | 10 min | Lines 277, 283 fixed                                  |
| **A2.11** | Fix theme property name: `tableRowBackgroundHoverSelected`        | 10 min | Line 177 fixed                                        |
| **A2.12** | Test Agent 2 UI flow manually                                     | 30 min | Modal opens, displays suggestions, applies categories |

**Total Effort:** 1 hour 20 minutes

#### Detailed Implementation: A2.8 - A2.9

**File:** `packages/desktop-client/src/components/accounts/Account.tsx`

```typescript
// Find the modal type union (around line 776)
// BEFORE
type ModalType =
  | 'transfer-ownership'
  | 'delete-budget'
  | ...
  | 'category-automations-unmigrate';

// AFTER
type ModalType =
  | 'transfer-ownership'
  | 'delete-budget'
  | ...
  | 'category-automations-unmigrate'
  | 'ai-categorize'; // ✅ ADD THIS
```

**File:** `packages/desktop-client/src/components/Modals.tsx`

```typescript
// Find the modal switch/case (around line 123)
// Add new case:
case 'ai-categorize':
  return <AICategorizeModal {...options} />;
```

#### Acceptance Criteria for Task Group 3

- [ ] All TypeScript errors in `Account.tsx` resolved
- [ ] All TypeScript errors in `Modals.tsx` resolved
- [ ] All TypeScript errors in `AICategorizeModal.tsx` resolved
- [ ] Manual test: "Suggest Categories" button opens modal
- [ ] Manual test: Modal displays with correct styling

---

## Phase 2: Build & Module Resolution (P1)

**Priority:** HIGH - Affects build system
**Estimated Effort:** 2-3 hours
**Dependencies:** None
**Owner:** TBD

### Task Group 4: Fix Module Resolution

| ID          | Task                                                                   | Effort | Acceptance Criteria           |
| ----------- | ---------------------------------------------------------------------- | ------ | ----------------------------- |
| **B1.1**    | Investigate `parse-file.ts` line 94 error: Cannot find './pdf-adapter' | 30 min | Understand root cause         |
| **B1.2**    | Option A: Explicit platform extension: `./pdf-adapter.web`             | 15 min | Error resolved                |
| **B1.2alt** | Option B: Fix TypeScript config to resolve `.web.ts` automatically     | 1 hour | Error resolved + future-proof |
| **B1.3**    | Verify build succeeds: `yarn build:browser`                            | 30 min | No build errors               |
| **B1.4**    | Verify Electron build: `yarn build:desktop`                            | 30 min | No build errors               |
| **B1.5**    | Test PDF import in built version (not just dev)                        | 30 min | Works in production build     |

**Total Effort:** 2.5 hours

#### Detailed Implementation: B1.2

**Option A: Explicit Import (Quick Fix)**

**File:** `packages/loot-core/src/server/transactions/import/parse-file.ts`

```typescript
// Line 94 - BEFORE
const { parsePDF } = await import('./pdf-adapter');

// Line 94 - AFTER (explicit platform)
const { parsePDF } = await import('./pdf-adapter.web');
```

**Pros:** Quick, simple
**Cons:** Hardcodes platform, won't work for Electron

**Option B: Fix TypeScript Config (Recommended)**

**File:** `packages/loot-core/tsconfig.json`

```json
{
  "compilerOptions": {
    ...
    "moduleResolution": "bundler", // or "node16"
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true
  }
}
```

**AND update package.json exports:**

**File:** `packages/loot-core/package.json`

```json
{
  "exports": {
    "./server/transactions/import/pdf-adapter": {
      "browser": "./src/server/transactions/import/pdf-adapter.web.ts",
      "electron": "./src/server/transactions/import/pdf-adapter.electron.ts",
      "default": "./src/server/transactions/import/pdf-adapter.web.ts"
    }
  }
}
```

**Pros:** Future-proof, follows best practices
**Cons:** More complex, may affect other imports

#### Acceptance Criteria for Task Group 4

- [ ] TypeScript error `TS2307: Cannot find module './pdf-adapter'` resolved
- [ ] `yarn build:browser` succeeds without errors
- [ ] `yarn build:desktop` succeeds without errors
- [ ] PDF import works in browser production build
- [ ] PDF import works in Electron production build (if applicable)

---

## Phase 3: Test Coverage (P1)

**Priority:** HIGH - Prevents regressions
**Estimated Effort:** 6-8 hours
**Dependencies:** Phase 1 must be complete for Agent 2 tests
**Owner:** TBD

### Task Group 5: Agent 1 Unit Tests

| ID       | Task                                               | Effort    | Acceptance Criteria                        |
| -------- | -------------------------------------------------- | --------- | ------------------------------------------ |
| **C1.1** | Write tests for `transaction-mapper.ts`            | 2 hours   | >80% coverage, validates all edge cases    |
| **C1.2** | Write tests for `claude-pdf-processor.ts` (mocked) | 2 hours   | >80% coverage, mocks Agent Server          |
| **C1.3** | Write tests for `pdf-adapter.web.ts`               | 1.5 hours | >80% coverage, integration test with mocks |

**Total Effort:** 5.5 hours

**See `e2e_spec.md` for detailed test specifications**

### Task Group 6: Agent 2 Unit Tests

| ID       | Task                                  | Effort  | Acceptance Criteria                   |
| -------- | ------------------------------------- | ------- | ------------------------------------- |
| **C2.1** | Write tests for `useAgent2Context.ts` | 2 hours | >80% coverage, validates payee lookup |
| **C2.2** | Write tests for `agent2-service.ts`   | 1 hour  | >80% coverage, mocks Agent Server     |

**Total Effort:** 3 hours

### Task Group 7: End-to-End Tests

| ID       | Task                                           | Effort  | Acceptance Criteria            |
| -------- | ---------------------------------------------- | ------- | ------------------------------ |
| **C3.1** | E2E test: PDF upload → transaction import      | 2 hours | Works with real PDF fixtures   |
| **C3.2** | E2E test: Category suggestion flow             | 2 hours | Works with sample transactions |
| **C3.3** | E2E test: Combined flow (PDF + categorization) | 1 hour  | Full workflow tested           |

**Total Effort:** 5 hours

---

## Phase 4: Code Quality & Cleanup (P2)

**Priority:** MEDIUM - Non-blocking improvements
**Estimated Effort:** 2-3 hours
**Dependencies:** None
**Owner:** TBD

### Task Group 8: Linting & Formatting

| ID       | Task                                                  | Effort | Acceptance Criteria            |
| -------- | ----------------------------------------------------- | ------ | ------------------------------ |
| **D1.1** | Run `yarn lint:fix` and commit changes                | 15 min | 0 lint errors remaining        |
| **D1.2** | Review auto-fixes for any logic changes               | 30 min | No unintended behavior changes |
| **D1.3** | Update `.eslintrc` if needed to prevent future issues | 30 min | New rules documented           |

**Total Effort:** 1 hour 15 minutes

### Task Group 9: Dead Code Removal

| ID       | Task                                                         | Effort | Acceptance Criteria    |
| -------- | ------------------------------------------------------------ | ------ | ---------------------- |
| **D2.1** | Remove `pdfjs-dist` dependency from `loot-core/package.json` | 5 min  | Dependency removed     |
| **D2.2** | Remove `pdf-parse` dependency from `loot-core/package.json`  | 5 min  | Dependency removed     |
| **D2.3** | Run `yarn install` to update lockfile                        | 5 min  | yarn.lock updated      |
| **D2.4** | Verify no code references these libraries                    | 15 min | Grep confirms no usage |
| **D2.5** | Test PDF import still works                                  | 10 min | No regressions         |

**Total Effort:** 40 minutes

### Task Group 10: Type Safety Improvements

| ID       | Task                                                            | Effort | Acceptance Criteria              |
| -------- | --------------------------------------------------------------- | ------ | -------------------------------- |
| **D3.1** | Replace `as any[]` cast in `transaction-mapper.ts:50`           | 15 min | Proper type used                 |
| **D3.2** | Replace `any \| null` return type in `transaction-mapper.ts:81` | 15 min | Explicit type                    |
| **D3.3** | Review all `@ts-strict-ignore` directives                       | 1 hour | Documented why needed or removed |

**Total Effort:** 1 hour 30 minutes

---

## Future Enhancements

### Enhancement 1: Agent Server Monitoring

- Add structured logging with log levels
- Implement metrics (transaction count, processing time, error rate)
- Add Sentry or similar error tracking

**Effort:** 4-6 hours

### Enhancement 2: Agent 2 Improvements

- Machine learning model for category prediction (optional)
- User feedback loop (learn from corrections)
- Batch processing for multiple transactions

**Effort:** 8-12 hours

### Enhancement 3: Agent 1 Improvements

- Support for more banks (BBVA, CaixaBank, ING)
- Automatic bank detection from PDF content
- Multi-language support (currently Spanish only)

**Effort:** 6-10 hours per bank

---

## Rollback Plan

### If Agent 1 Fix Causes Issues

**Symptoms:**

- PDF import fails
- Missing transaction data
- Category field errors in UI

**Rollback Steps:**

1. Revert commits:
   ```bash
   git revert HEAD~3..HEAD
   ```
2. Verify tests pass:
   ```bash
   yarn test
   ```
3. Redeploy:
   ```bash
   yarn build:browser
   fly deploy --config fly.actual.toml
   ```

**Recovery Time:** 15 minutes

### If Agent 2 Fix Causes Issues

**Symptoms:**

- Category suggestions fail
- TypeError: Cannot read property of undefined
- UI crashes when clicking "Suggest Categories"

**Rollback Steps:**

1. Disable Agent 2 feature flag (if implemented)
2. Or revert Agent 2 commits:
   ```bash
   git log --oneline --grep="agent2\|Agent 2" -10
   git revert <commit-hashes>
   ```
3. Remove "Suggest Categories" button from UI:
   ```typescript
   // ImportTransactionsModal.tsx
   // Comment out the button rendering
   ```

**Recovery Time:** 30 minutes

### Emergency Contacts

- **Agent Server Issues:** Check Fly.io logs: `fly logs --config fly.agent.toml`
- **Actual Budget Issues:** Check Fly.io logs: `fly logs --config fly.actual.toml`
- **Database Issues:** Backup is in `.actual-backup/` directory

---

## Task Summary Table

| Phase          | Task Group              | Priority | Effort      | Status           |
| -------------- | ----------------------- | -------- | ----------- | ---------------- |
| **Quick Wins** | 1. Agent 1 Category Fix | P0       | 17 min      | ✅ **COMPLETED** |
| **Phase 1**    | 2. Fix Payee Lookup     | P0       | 4h 15m      | ⏳ **TODO**      |
| **Phase 1**    | 3. Fix Agent 2 UI       | P0       | 1h 20m      | ⏳ **TODO**      |
| **Phase 2**    | 4. Module Resolution    | P1       | 2h 30m      | ⏳ **TODO**      |
| **Phase 3**    | 5. Agent 1 Tests        | P1       | 5h 30m      | ⏳ **TODO**      |
| **Phase 3**    | 6. Agent 2 Tests        | P1       | 3h          | ⏳ **TODO**      |
| **Phase 3**    | 7. E2E Tests            | P1       | 5h          | ⏳ **TODO**      |
| **Phase 4**    | 8. Linting              | P2       | 1h 15m      | ⏳ **TODO**      |
| **Phase 4**    | 9. Dead Code            | P2       | 40m         | ⏳ **TODO**      |
| **Phase 4**    | 10. Type Safety         | P2       | 1h 30m      | ⏳ **TODO**      |
| **TOTAL**      |                         |          | **25h 37m** | **3% Complete**  |

---

## Recommended Execution Order

### Week 1: Core Fixes

**Day 1-2:** Phase 1 (Agent 2 core fixes)

- Focus: Make Agent 2 functional
- Milestone: Agent 2 can suggest categories for sample transactions

**Day 3:** Phase 2 (Build system)

- Focus: Ensure production builds work
- Milestone: Both agents work in production build

### Week 2: Quality & Testing

**Day 4-5:** Phase 3 (Test coverage)

- Focus: Add comprehensive tests
- Milestone: >80% test coverage for both agents

**Day 6:** Phase 4 (Code quality)

- Focus: Clean up codebase
- Milestone: 0 lint errors, all dead code removed

### Week 3: Validation & Deployment

**Day 7:** End-to-end testing

- Focus: Real-world scenarios
- Milestone: Both agents tested with production data

---

## Success Metrics

### Phase 1 Success Criteria

- [ ] Agent 2 compiles without TypeScript errors
- [ ] Agent 2 returns category suggestions for test transactions
- [ ] UI displays suggestions correctly

### Phase 2 Success Criteria

- [ ] Production builds succeed without errors
- [ ] Both agents work in production environment

### Phase 3 Success Criteria

- [ ] > 80% test coverage for both agents
- [ ] All tests pass in CI
- [ ] E2E tests cover happy path and error cases

### Phase 4 Success Criteria

- [ ] 0 lint errors
- [ ] 0 dead dependencies
- [ ] <5 `@ts-strict-ignore` directives (documented)

---

## Contact & Support

**For questions or issues with this plan:**

- Review `risk_report.md` for detailed risk analysis
- Review `e2e_spec.md` for test specifications
- Check `status_update.md` for progress updates

**Key Files Modified:**

- `packages/loot-core/src/server/transactions/import/transaction-mapper.ts`
- `packages/loot-core/src/server/transactions/import/claude-pdf-processor.ts`
- `packages/loot-core/src/server/transactions/import/pdf-adapter.web.ts`
- `packages/desktop-client/src/hooks/useAgent2Context.ts` (TODO)
- `packages/desktop-client/src/components/accounts/Account.tsx` (TODO)

**Backup Location:** `.git/` (all changes are version controlled)
