/**
 * Categories API Endpoint
 * Phase 2: Agent 2 - Category Suggester
 *
 * Get user's categories for AI-powered category suggestions
 */

import { runQuery } from '../../../loot-core/src/server/db/index.js';

interface Category {
  id: string;
  name: string;
  isIncome: boolean;
  groupId: string;
  groupName: string;
  groupIsIncome: boolean;
}

/**
 * Get all active categories for an account
 * @param accountId - The account ID to fetch categories for
 * @returns Array of categories with group information
 */
export async function getAccountCategories(
  accountId: string,
): Promise<Category[]> {
  const query = `
    SELECT
      c.id,
      c.name,
      c.is_income,
      c.group_id,
      cg.name as group_name,
      cg.is_income as group_is_income
    FROM categories c
    LEFT JOIN category_groups cg ON c.group_id = cg.id
    WHERE c.tombstone = 0
    ORDER BY cg.sort_order, c.sort_order
  `;

  const categories = await runQuery(query, [], true);

  return categories.map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    isIncome: cat.is_income === 1,
    groupId: cat.group_id,
    groupName: cat.group_name,
    groupIsIncome: cat.group_is_income === 1,
  }));
}

/**
 * Express route handler for GET /api/categories/:accountId
 */
export async function handleGetCategories(req: any, res: any) {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const categories = await getAccountCategories(accountId);

    res.json({
      success: true,
      categories,
      total: categories.length,
    });
  } catch (error: any) {
    console.error('[API] Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
