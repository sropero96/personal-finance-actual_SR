/**
 * Transactions API Endpoint
 * Phase 2: Agent 2 - Category Suggester
 *
 * Search for similar transactions based on payee (exact and fuzzy matching)
 */

import { runQuery } from '../../../loot-core/src/server/db/index.js';

export interface SearchTransactionsParams {
  accountId: string;
  payee?: string;
  limit?: number;
  onlyCategorized?: boolean;
}

interface Transaction {
  id: string;
  date: number;
  amount: number;
  payeeName: string;
  category: string | null;
  categoryName: string | null;
  notes: string | null;
  cleared: boolean;
}

interface FuzzyTransaction extends Transaction {
  frequency: number;
}

/**
 * Search for transactions with exact payee match
 * @param params - Search parameters
 * @returns Array of matching transactions
 */
export async function searchTransactions(
  params: SearchTransactionsParams,
): Promise<Transaction[]> {
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

  // Filter by payee (exact match)
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

  const transactions = await runQuery(query, queryParams, true);

  return transactions.map((tx: any) => ({
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

/**
 * Search for transactions with fuzzy matching (keywords)
 * @param accountId - Account ID
 * @param payee - Payee name to search for
 * @param limit - Maximum results to return
 * @returns Array of matching transactions with frequency
 */
export async function searchTransactionsFuzzy(
  accountId: string,
  payee: string,
  limit: number = 20,
): Promise<FuzzyTransaction[]> {
  // Extract keywords from payee name
  const keywords = payee
    .split(/[\s,]+/)
    .filter((w) => w.length >= 3)
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
  const conditions = keywords.map((keyword) => {
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

  const transactions = await runQuery(query, queryParams, true);

  return transactions.map((tx: any) => ({
    id: tx.id,
    date: tx.date,
    amount: tx.amount,
    payeeName: tx.payee_name,
    category: tx.category,
    categoryName: tx.category_name,
    notes: tx.notes,
    cleared: tx.cleared === 1,
    frequency: tx.frequency,
  }));
}

/**
 * Express route handler for GET /api/transactions/search
 */
export async function handleSearchTransactions(req: any, res: any) {
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
  } catch (error: any) {
    console.error('[API] Error searching transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
