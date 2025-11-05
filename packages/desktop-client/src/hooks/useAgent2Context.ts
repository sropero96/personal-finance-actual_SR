/**
 * useAgent2Context Hook
 *
 * Fetches all context data needed for Agent 2 (Category Suggester):
 * - User's categories
 * - Active categorization rules
 * - Historical transactions (filtered by payees for efficiency)
 *
 * This hook optimizes queries to avoid fetching unnecessary data.
 */

import { useMemo } from 'react';

import { send } from 'loot-core/platform/client/fetch';
import { q } from 'loot-core/shared/query';
import {
  type TransactionEntity,
  type RuleEntity,
} from 'loot-core/types/models';

import { useCategories } from './useCategories';
import { useQuery } from './useQuery';

import type {
  Agent2Rule,
  Agent2HistoricalTransaction,
} from '@desktop-client/util/agent2-service';

/**
 * Utility function to extract payee name from a transaction
 *
 * TransactionEntity doesn't have a payee_name field. Instead:
 * - imported_payee: string name from bank import
 * - payee: PayeeEntity['id'] that needs lookup
 *
 * For Agent 2, we primarily use imported_payee since we're categorizing
 * newly imported transactions. For historical transactions, we use payee ID.
 */
function getPayeeName(tx: TransactionEntity): string {
  // Option 1: Use imported_payee if available (from import flow)
  if (tx.imported_payee) {
    return tx.imported_payee;
  }

  // Option 2: Use payee ID as fallback
  // Note: In a complete implementation, we would look up the payee name
  // from the payees table. For now, we use the ID as a grouping key.
  if (tx.payee) {
    return tx.payee;
  }

  // Fallback: Unknown payee
  return 'Unknown';
}

/**
 * Extracted context data for Agent 2
 */
export type Agent2Context = {
  categories: Array<{ id: string; name: string }>;
  rules: Agent2Rule[];
  historicalTransactions: Agent2HistoricalTransaction[];
  isLoading: boolean;
  error?: Error;
};

/**
 * Fetch Agent 2 context data for given transactions
 *
 * @param transactions - Transactions to categorize (used to filter historical data)
 * @returns Context data for Agent 2
 */
export function useAgent2Context(
  transactions: TransactionEntity[],
): Agent2Context {
  // Categories from Redux (already loaded)
  const categoriesData = useCategories();

  // Extract unique payee names/IDs from selected transactions
  const payeeFilters = useMemo(() => {
    const payeeNames = new Set<string>();
    const payeeIds = new Set<string>();

    transactions.forEach(tx => {
      // Use imported_payee instead of non-existent payee_name
      if (tx.imported_payee) payeeNames.add(tx.imported_payee);
      if (tx.payee) payeeIds.add(tx.payee);
    });

    return {
      names: Array.from(payeeNames),
      ids: Array.from(payeeIds),
    };
  }, [transactions]);

  // Query active rules
  const rulesQuery = useMemo(
    () => q('rules').filter({ active: true }).select('*'),
    [],
  );

  const {
    data: rulesData,
    isLoading: rulesLoading,
    error: rulesError,
  } = useQuery<RuleEntity>(() => rulesQuery, []);

  // Query historical transactions (only for relevant payees)
  const historicalQuery = useMemo(() => {
    // FIX V60: Only query if we have payees to filter by (check both IDs and names)
    if (payeeFilters.ids.length === 0 && payeeFilters.names.length === 0) {
      return null;
    }

    const filters: any[] = [];

    if (payeeFilters.ids.length > 0) {
      filters.push({ payee: { $oneof: payeeFilters.ids } });
    }

    if (payeeFilters.names.length > 0) {
      filters.push({ imported_payee: { $oneof: payeeFilters.names } });
    }

    return q('transactions')
      .filter({
        $or: filters, // Match EITHER payee ID OR imported_payee name
        category: { $ne: null }, // Only categorized transactions
      })
      .orderBy({ date: 'desc' })
      .limit(500) // Performance limit - fetch recent transactions only
      .select(['id', 'payee', 'imported_payee', 'category', 'date', 'notes']);
  }, [payeeFilters.ids, payeeFilters.names]);

  const {
    data: historicalData,
    isLoading: historicalLoading,
    error: historicalError,
  } = useQuery<TransactionEntity>(() => historicalQuery, [historicalQuery]);

  // Transform data to Agent 2 format
  const categories = useMemo(() => {
    if (!categoriesData?.list) return [];

    return categoriesData.list
      .filter(
        cat => !cat.hidden && cat.id !== 'income' && cat.id !== 'uncategorized',
      )
      .map(cat => ({
        id: cat.id,
        name: cat.name,
      }));
  }, [categoriesData]);

  const rules = useMemo(() => {
    if (!rulesData) return [];

    const filtered = rulesData
      .filter(rule => {
        return rule.conditions && rule.actions &&
               rule.conditions.length > 0 &&
               rule.actions.length > 0;
      })
      .map(rule => ({
        id: rule.id,
        conditions: rule.conditions || [],
        actions: rule.actions || [],
      })) as Agent2Rule[];

    console.log('[useAgent2Context] Rules processed:', {
      fetched: rulesData.length,
      afterFilter: filtered.length,
    });

    return filtered;
  }, [rulesData]);

  const historicalTransactions = useMemo(() => {
    if (!historicalData || !categoriesData?.list) return [];

    // Group by payee + category to calculate frequency
    const grouped = new Map<string, Agent2HistoricalTransaction>();

    historicalData.forEach(tx => {
      if (!tx.category) return;

      // Find category name
      const category = categoriesData.list.find(cat => cat.id === tx.category);
      if (!category) return;

      // Use utility function to get payee name
      const payeeName = getPayeeName(tx);
      const key = `${payeeName}|${tx.category}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.frequency = (existing.frequency || 1) + 1;
        // Keep most recent date
        if (tx.date > existing.date) {
          existing.date = tx.date;
        }
      } else {
        grouped.set(key, {
          payeeName,
          categoryName: category.name,
          category: tx.category,
          date: tx.date || '',
          frequency: 1,
        });
      }
    });

    return Array.from(grouped.values());
  }, [historicalData, categoriesData]);

  return {
    categories,
    rules,
    historicalTransactions,
    isLoading: rulesLoading || historicalLoading,
    error: rulesError || historicalError,
  };
}

/**
 * Fetch Agent 2 context data imperatively (for use in event handlers)
 *
 * This is useful when you need to fetch context data on-demand
 * rather than subscribing to live updates.
 *
 * @param transactions - Transactions to categorize
 * @param categoriesData - Current categories from Redux
 * @returns Context data for Agent 2
 */
export async function fetchAgent2Context(
  transactions: TransactionEntity[],
  categoriesData: any[], // CategoryEntity[]
): Promise<Omit<Agent2Context, 'isLoading' | 'error'>> {
  // FIX V60: Extract BOTH payee IDs (for existing transactions) AND payee names (for imports)
  const payeeIds = Array.from(
    new Set(transactions.map(tx => tx.payee).filter(Boolean) as string[]),
  );

  const payeeNames = Array.from(
    new Set(
      transactions
        .map(tx => tx.imported_payee || (tx as any).payee_name)
        .filter(Boolean) as string[],
    ),
  );

  // Fetch rules
  const rulesData: RuleEntity[] = await send('rules-get', {});

  // Fetch historical transactions
  let historicalData: TransactionEntity[] = [];

  // FIX V60: Query by NAMES for imported transactions OR IDs for existing transactions
  if (payeeNames.length > 0 || payeeIds.length > 0) {
    const filters: any[] = [];

    if (payeeIds.length > 0) {
      filters.push({ payee: { $oneof: payeeIds } });
    }

    if (payeeNames.length > 0) {
      filters.push({ imported_payee: { $oneof: payeeNames } });
    }

    // FIX V60.2: send('query') returns {data: [...], dependencies: [...]}, not array directly
    const queryResult = await send(
      'query',
      q('transactions')
        .filter({
          $or: filters, // Match EITHER payee ID OR imported_payee name
          category: { $ne: null },
        })
        .orderBy({ date: 'desc' })
        .limit(500)
        .select(['id', 'payee', 'imported_payee', 'category', 'date', 'notes'])
        .serialize(),
    );

    // Extract .data and validate it's an array
    historicalData = (queryResult?.data && Array.isArray(queryResult.data))
      ? queryResult.data
      : [];
  }

  console.log('[fetchAgent2Context V60.2] Historical data fetched:', {
    total: Array.isArray(historicalData) ? historicalData.length : 0,
    payeeIds: payeeIds.length,
    payeeNames: payeeNames.length,
    sample: Array.isArray(historicalData) ? historicalData.slice(0, 2) : [],
  });

  // Transform categories - FIX V60: Ensure it's always an array
  // Handle both array input and object with .list property
  let categoriesArray = Array.isArray(categoriesData)
    ? categoriesData
    : (categoriesData?.list || []);

  // Final safety check: ensure it's really an array
  if (!Array.isArray(categoriesArray)) {
    console.warn('[fetchAgent2Context V60] categoriesData is not an array:', typeof categoriesArray);
    categoriesArray = [];
  }

  const categories = categoriesArray
    .filter(
      cat => !cat.hidden && cat.id !== 'income' && cat.id !== 'uncategorized',
    )
    .map(cat => ({
      id: cat.id,
      name: cat.name,
    }));

  // Transform rules - FIX V60: Ensure rulesData is an array
  // Remove aggressive 'active' check - focus on content validation
  const rulesArray = Array.isArray(rulesData) ? rulesData : [];
  const rules = rulesArray
    .filter(rule => {
      return rule.conditions && rule.actions &&
             rule.conditions.length > 0 &&
             rule.actions.length > 0;
    })
    .map(rule => ({
      id: rule.id,
      conditions: rule.conditions || [],
      actions: rule.actions || [],
    })) as Agent2Rule[];

  console.log('[fetchAgent2Context V60] Rules processed:', {
    fetched: rulesArray.length,
    afterFilter: rules.length,
    sample: rules.length > 0 ? rules.slice(0, 2) : [],
  });

  // Transform historical transactions
  const grouped = new Map<string, Agent2HistoricalTransaction>();

  // FIX V60.2: Defensive check - ensure historicalData is actually an array
  const safeHistoricalData = Array.isArray(historicalData) ? historicalData : [];
  safeHistoricalData.forEach(tx => {
    if (!tx.category) return;

    const category = categoriesArray.find(cat => cat.id === tx.category);
    if (!category) return;

    // Use utility function to get payee name
    const payeeName = getPayeeName(tx);
    const key = `${payeeName}|${tx.category}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.frequency = (existing.frequency || 1) + 1;
      if (tx.date > existing.date) {
        existing.date = tx.date;
      }
    } else {
      grouped.set(key, {
        payeeName,
        categoryName: category.name,
        category: tx.category,
        date: tx.date || '',
        frequency: 1,
      });
    }
  });

  const historicalTransactions = Array.from(grouped.values());

  return {
    categories,
    rules,
    historicalTransactions,
  };
}
