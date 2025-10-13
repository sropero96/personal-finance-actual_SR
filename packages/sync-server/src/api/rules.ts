/**
 * Rules API Endpoint
 * Phase 2: Agent 2 - Category Suggester
 *
 * Get active categorization rules for an account
 */

import { runQuery } from '../../../loot-core/src/server/db/index.js';

export interface Rule {
  id: string;
  conditions: Array<{
    field: string;
    op: string;
    value: string;
  }>;
  actions: Array<{
    field: string;
    value: string;
  }>;
  stage: string;
}

/**
 * Get all active rules for an account
 * @param accountId - The account ID to fetch rules for
 * @returns Array of active rules
 */
export async function getActiveRules(accountId: string): Promise<Rule[]> {
  const query = `
    SELECT
      r.id,
      r.conditions,
      r.actions,
      r.stage
    FROM rules r
    WHERE r.tombstone = 0
    ORDER BY r.sort_order
  `;

  const rules = await runQuery(query, [], true);

  return rules.map((rule: any) => ({
    id: rule.id,
    conditions: JSON.parse(rule.conditions || '[]'),
    actions: JSON.parse(rule.actions || '[]'),
    stage: rule.stage || 'pre',
  }));
}

/**
 * Express route handler for GET /api/rules/:accountId
 */
export async function handleGetRules(req: any, res: any) {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const rules = await getActiveRules(accountId);

    // Filter rules that affect category
    const categoryRules = rules.filter((rule) =>
      rule.actions.some((action) => action.field === 'category'),
    );

    res.json({
      success: true,
      rules: categoryRules,
      total: categoryRules.length,
    });
  } catch (error: any) {
    console.error('[API] Error fetching rules:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
