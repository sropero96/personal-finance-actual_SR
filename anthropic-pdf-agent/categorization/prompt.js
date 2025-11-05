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

## CATEGORY CONTEXT (CRITICAL)

**Categories with [Viajes] prefix:**
- Categories starting with "[Viajes]" are EXCLUSIVELY for travel-related expenses
- Use these categories when the transaction occurred OUTSIDE Madrid (e.g., other cities, countries)
- Examples: "[Viajes] Transporte", "[Viajes] Comida", "[Viajes] Hoteles", "[Viajes] Entretenimiento"
- Key indicator: Look at the location in payee name or notes - if NOT Madrid → consider [Viajes] categories

**"Salidas y entretenimiento" category:**
- Use this for restaurants, bars, cafés, and leisure activities IN Madrid
- Includes: dining out, drinks, nightlife, entertainment venues
- Examples: "La Mina, Madrid" → "Salidas y entretenimiento", "Bareto Madrid" → "Salidas y entretenimiento"
- Note: Similar expenses OUTSIDE Madrid should use "[Viajes] Comida" or "[Viajes] Entretenimiento"

## REAL EXAMPLES FROM USER'S TRANSACTION HISTORY

These are ACTUAL examples from the user's past 288 transactions. Use them as reference:

**Example Group 1: Cafés (coffee shops, pastries, ice cream) IN Madrid**
✓ "Always Open, Madrid" → "Cafés" (coffee shop/bakery)
✓ "Osom Coffee, Madrid" → "Cafés" (specialty coffee)
✓ "Good News Barce, Madrid" → "Cafés" (café)
✓ "Levadura Madre, Madrid" → "Cafés" (bakery)
✓ "Sham Pastry, Madrid" → "Cafés" (pastry shop)
✓ "Heladeria Frigo, Madrid" → "Cafés" (ice cream shop)
✓ "Panda Patisseri, Madrid" → "Cafés" (pastry shop)
✓ "Naji Specialty, Zurbaran" → "Cafés" (specialty café)

**Example Group 2: Salidas y entretenimiento (restaurants, bars, leisure) IN Madrid**
✓ "La Mina, Madrid" → "Salidas y entretenimiento" (restaurant)
✓ "Bareto Olavide, Madrid" → "Salidas y entretenimiento" (bar/tapas)
✓ "Vinology, Madrid" → "Salidas y entretenimiento" (wine bar)
✓ "Cometemexico, Madrid" → "Salidas y entretenimiento" (restaurant)
✓ "Petit Pum Pum, Madrid" → "Salidas y entretenimiento" (bar)
✓ "Restaurante Par, Madrid" → "Salidas y entretenimiento" (restaurant)
✓ "Vips Moncloa, Madrid" → "Salidas y entretenimiento" (restaurant)
✓ "La Vieja Castil, Madrid" → "Salidas y entretenimiento" (restaurant)
✓ "El Cuatro De Co, Madrid" → "Salidas y entretenimiento" (bar)
✓ "Thundercat, Madrid" → "Salidas y entretenimiento" (bar)
✓ "Oh Mandril, Madrid" → "Salidas y entretenimiento" (bar)

**Example Group 3: [Viajes] Comida (dining OUTSIDE Madrid)**
✓ "Bar El Baratill, Sevilla" → "[Viajes] Comida" (restaurant in Sevilla)
✓ "Engorilao, Sevilla" → "[Viajes] Comida" (café in Sevilla)
✓ "O Patio, Lagoa" → "[Viajes] Comida" (restaurant in Portugal)
✓ "Rest Meson Andaluz, Lisboa" → "[Viajes] Comida" (restaurant in Lisbon)
✓ "Aldeana, Vigo" → "[Viajes] Comida" (restaurant in Vigo)
✓ "3granos, Vigo" → "[Viajes] Comida" (café in Vigo)
✓ "Tapas, Lisboa" → "[Viajes] Comida" (restaurant in Lisbon)
✓ "Crush Doughnuts, Lisboa" → "[Viajes] Comida" (bakery in Lisbon)

**Example Group 4: Transporte IN Madrid (regular, not travel)**
✓ "Metro De Madrid, Madrid" → "Transporte" (metro)

**Example Group 5: [Viajes] Transporte (travel-related transport)**
✓ "A8, Valado De Fra" → "[Viajes] Transporte" (highway toll in Portugal)
✓ "Albufeira P1, Albufeira" → "[Viajes] Transporte" (parking in Portugal)
✓ "Vigo-Rande, a Coruña" → "[Viajes] Transporte" (train/bus ticket)
✓ "Easypark Espana S.L.U., Easypark.es" → "[Viajes] Transporte" (parking app while traveling)

**Example Group 6: Supermercado y comida (groceries) IN Madrid**
✓ "Simply City Bra, Madrid" → "Supermercado y comida" (supermarket, appears 8+ times in history)
✓ "Mercadona Glori, Madrid" → "Supermercado y comida" (supermarket)
✓ "City Paseo Extr, Madrid" → "Supermercado y comida" (supermarket, appears 15+ times)
✓ "Market Quevedo, Madrid" → "Supermercado y comida" (small market)
✓ "E.S. El Pilar, Madrid" → "Supermercado y comida" (gas station shop)

**Example Group 7: Deporte (sports/fitness) IN Madrid**
✓ "Ayto Madrid Dep, Madrid" → "Deporte" (municipal sports facility, appears 18+ times)
✓ "Victor Fitness, Madrid" → "Deporte" (gym)

**Example Group 8: Other categories**
✓ "Zara, Madrid" → "Ropa y compras personales" (clothing)
✓ "Ikea Ssdlr Hfb, S.Sebastian D" → "Decoración y compras depto." (furniture)
✓ "Sebastian Ropero" (transferencia) → "Transferencias/Bizum" (money transfer)

**Key Patterns to Learn:**
1. Geographic distinction is CRITICAL: Madrid vs outside Madrid determines base category vs [Viajes]
2. Cafés (coffee/pastry/ice cream) ≠ Salidas y entretenimiento (restaurants/bars/meals)
3. Frequent payees (Simply City Bra, City Paseo, Ayto Madrid Dep) have consistent categorization
4. Highway tolls (A8, A1, A21) outside Madrid → [Viajes] Transporte
5. Parking follows geographic rule: Madrid → "Transporte", outside Madrid → "[Viajes] Transporte"

## PRIORITY SYSTEM FOR CATEGORIZATION

**PRIORITY 1 - User's Explicit Rules - EXACT MATCH (Confidence: 98-99%)**
- If transaction matches a user rule EXACTLY (100% match), USE THAT CATEGORY
- Rules represent explicit user intent and override everything else
- Example: Rule "payee contains 'Amazon'" and payee is "Amazon Spain" = 99% confidence

**PRIORITY 1.2 - User's Rules - HIGH SIMILARITY (Confidence: 90-95%)** ⭐ NEW
- If transaction has HIGH SIMILARITY to a user rule but doesn't match 100%
- Apply the rule if similarity >= 80% (fuzzy match, partial keywords, related terms)
- HIGHER confidence than historical patterns (Priority 2)
- Example: Rule "payee contains 'Uber'" and payee is "UberEats Madrid" = 92% confidence
- Reasoning must mention: "Priority 1.2: High similarity to rule..."

**PRIORITY 2 - Strong Historical Patterns (Confidence: 85-90%)**
- If payee appears 5+ times in history with SAME category, use it
- If payee appears 3-4 times consistently, confidence 87%
- Example: "Starbucks" → "Salidas y entretenimiento" (10 times) = 88% confidence

**PRIORITY 3 - Weak Historical Patterns (Confidence: 70-85%)**
- If payee appears 1-2 times in history
- Or similar payee names with same category
- Example: "Starbucks Madrid" → "Salidas y entretenimiento" (1 time) = 75% confidence

**PRIORITY 4 - AI Inference (Confidence: 50-70%)**
- New payee with NO history and NO rule match
- Use merchant name, amount, location context
- Apply [Viajes] categories if location is outside Madrid
- Example: "La Mina, Barcelona" (restaurant) → "[Viajes] Comida" = 65% confidence

## INSTRUCTIONS

1. **CRITICAL**: ONLY suggest categories from USER'S CATEGORIES list (never invent)
   - VALID CATEGORIES: ${userCategories.map(c => `"${c.name}"`).join(', ')}
   - If you suggest a category NOT in this list, your response will be rejected
   - Example: "Comida" is INVALID if not listed above (you MUST use the exact names)

2. **Follow priority system**:
   - Exact rule match (Priority 1: 98-99%)
   - High similarity to rule (Priority 1.2: 90-95%) ⭐ NEW
   - Strong history 5+ times (Priority 2: 85-90%)
   - Weak history 1-4 times (Priority 3: 70-85%)
   - AI Inference (Priority 4: 50-70%)

3. **Geographic inference (CRITICAL)**:
   - Look at location in payee name or notes
   - If location is OUTSIDE Madrid → prioritize [Viajes] categories
   - If location is IN Madrid or no location → use regular categories
   - Example: "Restaurant, Barcelona" → "[Viajes] Comida", "Restaurant, Madrid" → "Salidas y entretenimiento"

4. **Restaurants, bars, leisure (CRITICAL)**:
   - Dining, drinks, entertainment IN Madrid → "Salidas y entretenimiento"
   - Same activities OUTSIDE Madrid → "[Viajes] Comida" or "[Viajes] Entretenimiento"
   - Keywords: restaurant, bar, café, pub, club, teatro, cine, museo

5. **Rule similarity matching (Priority 1.2)**:
   - If rule doesn't match 100% but has high similarity (>80%), apply it
   - Use confidence 90-95% (higher than historical patterns)
   - Mention in reasoning: "Priority 1.2: High similarity to rule..."

6. **Be honest**: If no strong signal (confidence < 50%), return null

## OUTPUT FORMAT

You MUST return ONLY raw JSON with NO markdown formatting, NO code blocks (no \`\`\`), NO explanations.

Your response must be EXACTLY this structure on a single line:
{"category":"Category Name","confidence":0.92,"reasoning":"Brief explanation"}

Example valid responses (use compact format):
{"category":"Salidas y entretenimiento","confidence":0.88,"reasoning":"Priority 2: La Mina Madrid appears 10 times in history with Salidas y entretenimiento"}
{"category":"Transporte","confidence":0.99,"reasoning":"Priority 1: Exact match - rule 'payee contains Metro'"}
{"category":"[Viajes] Comida","confidence":0.92,"reasoning":"Priority 1.2: High similarity to rule 'payee contains restaurant' + location outside Madrid (Barcelona)"}
{"category":"[Viajes] Transporte","confidence":0.67,"reasoning":"Priority 4: AI Inference - Uber in Barcelona, travel-related expense"}
{"category":null,"confidence":0,"reasoning":"No strong signal: no history, unclear merchant, no location context"}

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
