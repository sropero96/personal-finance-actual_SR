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
import { type TransactionEntity, type RuleEntity } from 'loot-core/types/models';

import { useCategories } from './useCategories';
import { useQuery } from './useQuery';

import type {
  Agent2Rule,
  Agent2HistoricalTransaction,
} from '@desktop-client/util/agent2-service';

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
  transactions: TransactionEntity[]
): Agent2Context {
  // Categories from Redux (already loaded)
  const categoriesData = useCategories();

  // Extract unique payee names/IDs from selected transactions
  const payeeFilters = useMemo(() => {
    const payeeNames = new Set<string>();
    const payeeIds = new Set<string>();

    transactions.forEach(tx => {
      if (tx.payee_name) payeeNames.add(tx.payee_name);
      if (tx.payee) payeeIds.add(tx.payee);
    });

    return {
      names: Array.from(payeeNames),
      ids: Array.from(payeeIds),
    };
  }, [transactions]);

  // Query active rules
  const rulesQuery = useMemo(
    () =>
      q('rules')
        .filter({ active: true })
        .select('*'),
    []
  );

  const { data: rulesData, isLoading: rulesLoading, error: rulesError } =
    useQuery<RuleEntity>(rulesQuery, []);

  // Query historical transactions (only for relevant payees)
  const historicalQuery = useMemo(() => {
    // Only query if we have payees to filter by
    if (payeeFilters.ids.length === 0) {
      return null;
    }

    return q('transactions')
      .filter({
        $or: [
          { payee: { $oneof: payeeFilters.ids } },
          // TODO: Add payee_name filter if needed
        ],
        category: { $ne: null }, // Only categorized transactions
      })
      .orderBy({ date: 'desc' })
      .limit(500) // Performance limit - fetch recent transactions only
      .select(['id', 'payee', 'payee_name', 'category', 'date', 'notes']);
  }, [payeeFilters.ids]);

  const { data: historicalData, isLoading: historicalLoading, error: historicalError } =
    useQuery<TransactionEntity>(historicalQuery, [historicalQuery]);

  // Transform data to Agent 2 format
  const categories = useMemo(() => {
    if (!categoriesData) return [];

    return categoriesData
      .filter(cat => !cat.hidden && cat.id !== 'income' && cat.id !== 'uncategorized')
      .map(cat => ({
        id: cat.id,
        name: cat.name,
      }));
  }, [categoriesData]);

  const rules = useMemo(() => {
    if (!rulesData) return [];

    return rulesData
      .filter(rule => rule.conditions && rule.actions)
      .map(rule => ({
        id: rule.id,
        conditions: rule.conditions || [],
        actions: rule.actions || [],
      })) as Agent2Rule[];
  }, [rulesData]);

  const historicalTransactions = useMemo(() => {
    if (!historicalData || !categoriesData) return [];

    // Group by payee + category to calculate frequency
    const grouped = new Map<string, Agent2HistoricalTransaction>();

    historicalData.forEach(tx => {
      if (!tx.category) return;

      // Find category name
      const category = categoriesData.find(cat => cat.id === tx.category);
      if (!category) return;

      const key = `${tx.payee || tx.payee_name}|${tx.category}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.frequency = (existing.frequency || 1) + 1;
        // Keep most recent date
        if (tx.date > existing.date) {
          existing.date = tx.date;
        }
      } else {
        grouped.set(key, {
          payeeName: tx.payee_name || '',
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
  categoriesData: any[] // CategoryEntity[]
): Promise<Omit<Agent2Context, 'isLoading' | 'error'>> {
  // Extract unique payee IDs
  const payeeIds = Array.from(
    new Set(
      transactions
        .map(tx => tx.payee)
        .filter(Boolean) as string[]
    )
  );

  // Fetch rules
  const rulesData: RuleEntity[] = await send('rules-get', {});

  // Fetch historical transactions
  let historicalData: TransactionEntity[] = [];

  if (payeeIds.length > 0) {
    historicalData = await send('transactions-query', {
      query: q('transactions')
        .filter({
          payee: { $oneof: payeeIds },
          category: { $ne: null },
        })
        .orderBy({ date: 'desc' })
        .limit(500)
        .select(['id', 'payee', 'payee_name', 'category', 'date', 'notes'])
        .serialize(),
    });
  }

  // Transform categories
  const categories = categoriesData
    .filter(cat => !cat.hidden && cat.id !== 'income' && cat.id !== 'uncategorized')
    .map(cat => ({
      id: cat.id,
      name: cat.name,
    }));

  // Transform rules
  const rules = (rulesData || [])
    .filter(rule => rule.active && rule.conditions && rule.actions)
    .map(rule => ({
      id: rule.id,
      conditions: rule.conditions || [],
      actions: rule.actions || [],
    })) as Agent2Rule[];

  // Transform historical transactions
  const grouped = new Map<string, Agent2HistoricalTransaction>();

  (historicalData || []).forEach(tx => {
    if (!tx.category) return;

    const category = categoriesData.find(cat => cat.id === tx.category);
    if (!category) return;

    const key = `${tx.payee || tx.payee_name}|${tx.category}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.frequency = (existing.frequency || 1) + 1;
      if (tx.date > existing.date) {
        existing.date = tx.date;
      }
    } else {
      grouped.set(key, {
        payeeName: tx.payee_name || '',
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
