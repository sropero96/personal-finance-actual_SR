/**
 * Prompt Engineering for Categorization Agent
 * Phase 2: Agent 2 - Category Suggester
 */

/**
 * Build the categorization prompt for Claude
 * @param {Object} context - Context object containing transaction and user data
 * @param {Object} context.transaction - The transaction to categorize
 * @param {Array} context.userCategories - User's available categories
 * @param {Array} context.activeRules - User's active categorization rules
 * @param {Array} context.similarTransactions - Historical similar transactions
 * @returns {string} The formatted prompt for Claude
 */
function buildCategorizationPrompt(context) {
  const { transaction, userCategories, activeRules, similarTransactions } =
    context;

  // Check if a rule matches first (optimization)
  const { findMatchingRule } = require('./search');
  const ruleMatch = findMatchingRule(transaction, activeRules);

  if (ruleMatch.matched) {
    // If a rule matches, return the result directly (no need to call Claude)
    const category = userCategories.find(c => c.id === ruleMatch.categoryId);
    return {
      skipClaude: true,
      result: {
        category: category?.name || null,
        confidence: 0.98,
        reasoning: `Matches active rule: ${JSON.stringify(ruleMatch.rule.conditions)}`,
      },
    };
  }

  // Build prompt for Claude
  const prompt = `You are a transaction categorization expert for Actual Budget, a personal finance app.

I will provide you with:
1. A transaction that needs categorization
2. The user's available categories (their personal list)
3. Similar historical transactions with categories assigned
4. Active categorization rules (if any)

Your task is to suggest the BEST category from the user's list.

## USER'S CATEGORIES
${JSON.stringify(
  userCategories.map(c => ({
    id: c.id,
    name: c.name,
    group: c.groupName,
    isIncome: c.isIncome,
  })),
  null,
  2,
)}

## TRANSACTION TO CATEGORIZE
{
  "date": "${transaction.date}",
  "payee": "${transaction.payee_name || transaction.payee}",
  "amount": ${transaction.amount},
  "notes": "${transaction.notes || ''}"
}

## HISTORICAL CONTEXT
${
  similarTransactions.length > 0
    ? JSON.stringify(
        similarTransactions.map(tx => ({
          payee: tx.payeeName,
          category: tx.categoryName,
          date: tx.date,
          amount: tx.amount,
        })),
        null,
        2,
      )
    : '(No similar transactions found in history)'
}

## INSTRUCTIONS

1. **ONLY suggest categories that exist in USER'S CATEGORIES** (never invent new ones)
2. **Learn from history** - If the payee appears multiple times, use the most frequent category
3. **Consider amount** - Income vs expense categories based on positive/negative amount
4. **Reason clearly** - Explain your decision
5. **Be honest about confidence** - If unsure, say so (confidence < 0.7)

## OUTPUT FORMAT

Return ONLY a JSON object (no markdown, no code blocks):

{
  "category": "Category Name",
  "confidence": 0.92,
  "reasoning": "Brief explanation of why this category was chosen"
}

If you cannot suggest a category with confidence >= 0.5, return:

{
  "category": null,
  "confidence": 0,
  "reasoning": "Reason why categorization is uncertain"
}

IMPORTANT: Return ONLY the JSON object, nothing else.`;

  return { skipClaude: false, prompt };
}

module.exports = {
  buildCategorizationPrompt,
};
