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

  // Build prompt for Claude with PRIORITY SYSTEM
  const prompt = `You are a transaction categorization expert for Actual Budget, a personal finance app.

I will provide you with:
1. A transaction that needs categorization
2. The user's available categories (their personal list)
3. Similar historical transactions with categories assigned
4. Active categorization rules (user's manual rules)

Your task is to suggest the BEST category from the user's list using a PRIORITY SYSTEM.

## USER'S CATEGORIES
${JSON.stringify(
  userCategories.map(c => {
    // FIX V57: Only include fields that are defined to avoid undefined in JSON
    const category = { id: c.id, name: c.name };
    if (c.groupName !== undefined) category.group = c.groupName;
    if (c.isIncome !== undefined) category.isIncome = c.isIncome;
    return category;
  }),
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

## HISTORICAL CONTEXT (User's Past Behavior)
${
  similarTransactions.length > 0
    ? JSON.stringify(
        similarTransactions.map(tx => ({
          payee: tx.payeeName,
          category: tx.categoryName,
          date: tx.date,
          frequency: tx.frequency || 1,
        })),
        null,
        2,
      )
    : '(No similar transactions found in history)'
}

## ACTIVE RULES (User's Manual Rules)
${
  activeRules && activeRules.length > 0
    ? JSON.stringify(
        activeRules.map(rule => ({
          conditions: rule.conditions,
          actions: rule.actions,
        })),
        null,
        2,
      )
    : '(No active rules found - user has not set up automatic categorization rules)'
}

## PRIORITY SYSTEM FOR CATEGORIZATION

**PRIORITY 1 - User's Explicit Rules (Confidence: 95-99%)**
- If transaction matches a user rule (even partially), USE THAT CATEGORY
- Rules represent explicit user intent and override everything else
- Example: Rule "payee contains 'Amazon' → Shopping" means confidence >= 98%

**PRIORITY 2 - Strong Historical Patterns (Confidence: 85-95%)**
- If payee appears 5+ times in history with SAME category, use it
- If payee appears 3-4 times consistently, confidence 90%
- Example: "Starbucks" → "Coffee" (10 times) = 95% confidence

**PRIORITY 3 - Weak Historical Patterns (Confidence: 70-85%)**
- If payee appears 1-2 times in history
- Or similar payee names with same category
- Example: "Starbucks Madrid" → "Coffee" (1 time) = 75% confidence

**PRIORITY 4 - AI Inference (Confidence: 50-70%)**
- New payee with NO history
- Use merchant name, amount, context clues
- Example: "La Mina, Madrid" (restaurant name) → "Salidas" = 65% confidence

## INSTRUCTIONS

1. **CRITICAL**: ONLY suggest categories from USER'S CATEGORIES list (never invent)
   - VALID CATEGORIES: ${userCategories.map(c => `"${c.name}"`).join(', ')}
   - If you suggest a category NOT in this list, your response will be rejected
   - Example: "Comida" is INVALID if not listed above (you MUST use the exact names)
2. **Follow priority system**: Rules > History (5+) > History (1-4) > AI Inference
3. **Learn from history**: If frequency >= 5, confidence should be 90-95%
4. **Consider partial rule matches**: If payee contains keyword from rule, apply it
5. **Be honest**: If no strong signal (confidence < 50%), return null

## OUTPUT FORMAT

You MUST return ONLY raw JSON with NO markdown formatting, NO code blocks (no \`\`\`), NO explanations.

Your response must be EXACTLY this structure on a single line:
{"category":"Category Name","confidence":0.92,"reasoning":"Brief explanation"}

Example valid responses (use compact format):
{"category":"Salidas","confidence":0.85,"reasoning":"Priority 2: Starbucks appears 10 times in history with Salidas"}
{"category":"Restaurantes","confidence":0.92,"reasoning":"Priority 1: Matches rule 'payee contains restaurant'"}
{"category":null,"confidence":0,"reasoning":"No strong signal: no history, unclear merchant"}

CRITICAL RULES:
- Start your response directly with { (not with \`\`\`)
- End your response directly with } (not with \`\`\`)
- Use compact format (no extra spaces or newlines inside the JSON)
- Return ONLY the JSON object - nothing before or after it

DO NOT wrap your response in markdown code blocks. DO NOT add explanations outside the JSON.`;

  return { skipClaude: false, prompt };
}

module.exports = {
  buildCategorizationPrompt,
};
