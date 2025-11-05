/**
 * Search algorithms for finding similar transactions
 * Phase 2: Agent 2 - Category Suggester
 */

/**
 * Extract keywords from a payee name
 * Examples:
 *   "La Mina, Madrid" → ["mina", "madrid"]
 *   "Loomisp*campo Del Moro" → ["loomisp", "campo", "moro"]
 */
function extractKeywords(payeeName) {
  if (!payeeName) return [];

  return payeeName
    .toLowerCase()
    .replace(/[*,;]/g, ' ') // Remove special chars
    .split(/\s+/) // Split by whitespace
    .filter(
      word =>
        word.length >= 3 && // Min 3 chars
        !['del', 'la', 'el', 'los', 'las', 'de', 'con', 'en'].includes(word), // Remove common Spanish words
    )
    .slice(0, 3); // Top 3 keywords only
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching when SQL LIKE is not enough
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Deduplicate and sort transactions by frequency and recency
 */
function deduplicateAndSort(transactions) {
  // Group by category
  const grouped = {};

  transactions.forEach(tx => {
    const key = tx.categoryName;
    if (!grouped[key]) {
      grouped[key] = {
        categoryName: tx.categoryName,
        category: tx.category,
        frequency: 0,
        lastUsed: tx.date,
        examples: [],
      };
    }

    grouped[key].frequency += tx.frequency || 1;
    grouped[key].examples.push(tx.payeeName);

    // Keep most recent date
    if (tx.date > grouped[key].lastUsed) {
      grouped[key].lastUsed = tx.date;
    }
  });

  // Sort by frequency DESC, then by recency DESC
  return Object.values(grouped).sort((a, b) => {
    if (b.frequency !== a.frequency) {
      return b.frequency - a.frequency;
    }
    return b.lastUsed - a.lastUsed;
  });
}

/**
 * Check if a rule matches a transaction
 */
function ruleMatches(rule, transaction) {
  return rule.conditions.every(condition => {
    const { field, op, value } = condition;

    // FIX V57: Handle both 'payee' and 'payee_name' field names
    // Frontend sends payee_name, but rules use 'payee'
    let txValue;
    if (field === 'payee') {
      txValue = String(transaction.payee_name || transaction.payee || '').toLowerCase();
    } else {
      txValue = String(transaction[field] || '').toLowerCase();
    }

    const conditionValue = String(value).toLowerCase();

    switch (op) {
      case 'contains':
        return txValue.includes(conditionValue);
      case 'is':
        return txValue === conditionValue;
      case 'oneOf':
        try {
          const values = JSON.parse(value);
          return values.map(v => v.toLowerCase()).includes(txValue);
        } catch (e) {
          return false;
        }
      default:
        return false;
    }
  });
}

/**
 * Find best matching rule for a transaction
 */
function findMatchingRule(transaction, rules) {
  for (const rule of rules) {
    if (ruleMatches(rule, transaction)) {
      const categoryAction = rule.actions.find(a => a.field === 'category');
      if (categoryAction) {
        return {
          matched: true,
          categoryId: categoryAction.value,
          rule,
        };
      }
    }
  }

  return { matched: false };
}

module.exports = {
  extractKeywords,
  levenshteinDistance,
  deduplicateAndSort,
  ruleMatches,
  findMatchingRule,
};
