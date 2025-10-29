/**
 * Test script for Agent 2 - Category Suggester
 * Tests the new frontend-provided data approach
 */

const AGENT_SERVER_URL = 'http://localhost:4000';

async function testAgent2() {
  console.log('🧪 Testing Agent 2 with frontend-provided data...\n');

  // Mock data from frontend
  const requestData = {
    transactions: [
      {
        id: 'tx-1',
        payee_name: 'La Mina, Madrid',
        amount: -41.8,
        date: '2025-07-17',
        notes: 'Pago Movil En La Mina, Madrid',
      },
      {
        id: 'tx-2',
        payee_name: 'Mercadona',
        amount: -25.5,
        date: '2025-07-18',
        notes: 'Compra en supermercado',
      },
      {
        id: 'tx-3',
        payee_name: 'Restaurante El Jardín',
        amount: -65.0,
        date: '2025-07-19',
        notes: 'Cena con amigos',
      },
    ],
    categories: [
      { id: 'cat-1', name: 'Food & Dining' },
      { id: 'cat-2', name: 'Groceries' },
      { id: 'cat-3', name: 'Entertainment' },
      { id: 'cat-4', name: 'Transportation' },
      { id: 'cat-5', name: 'Shopping' },
    ],
    rules: [
      {
        id: 'rule-1',
        conditions: [
          { field: 'payee_name', op: 'contains', value: 'mercadona' },
        ],
        actions: [{ field: 'category', value: 'cat-2' }],
      },
    ],
    historicalTransactions: [
      {
        payeeName: 'La Mina, Madrid',
        categoryName: 'Food & Dining',
        category: 'cat-1',
        date: '2025-06-15',
        frequency: 3,
      },
      {
        payeeName: 'La Mina',
        categoryName: 'Food & Dining',
        category: 'cat-1',
        date: '2025-06-20',
        frequency: 2,
      },
      {
        payeeName: 'Mercadona',
        categoryName: 'Groceries',
        category: 'cat-2',
        date: '2025-07-01',
        frequency: 5,
      },
      {
        payeeName: 'Restaurante El Jardín',
        categoryName: 'Food & Dining',
        category: 'cat-1',
        date: '2025-05-10',
        frequency: 1,
      },
    ],
  };

  try {
    console.log('📤 Sending request to Agent 2...');
    console.log(`   Transactions: ${requestData.transactions.length}`);
    console.log(`   Categories: ${requestData.categories.length}`);
    console.log(`   Rules: ${requestData.rules.length}`);
    console.log(
      `   Historical: ${requestData.historicalTransactions.length}\n`,
    );

    const response = await fetch(`${AGENT_SERVER_URL}/api/suggest-categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    console.log('✅ Response received:\n');
    console.log(JSON.stringify(result, null, 2));

    // Verify results
    console.log('\n🔍 Verification:');

    const expectations = [
      {
        txId: 'tx-1',
        expectedSource: 'history',
        expectedCategory: 'Food & Dining',
      },
      { txId: 'tx-2', expectedSource: 'rule', expectedCategory: 'Groceries' },
      {
        txId: 'tx-3',
        expectedSource: 'history',
        expectedCategory: 'Food & Dining',
      },
    ];

    let allCorrect = true;

    expectations.forEach(({ txId, expectedSource, expectedCategory }) => {
      const suggestion = result.suggestions.find(
        s => s.transaction_id === txId,
      );

      if (!suggestion) {
        console.log(`   ❌ ${txId}: No suggestion found`);
        allCorrect = false;
        return;
      }

      const sourceMatch = suggestion.source === expectedSource;
      const categoryMatch = suggestion.category === expectedCategory;

      if (sourceMatch && categoryMatch) {
        console.log(
          `   ✅ ${txId}: ${suggestion.category} (${suggestion.source}, conf: ${suggestion.confidence})`,
        );
      } else {
        console.log(
          `   ⚠️  ${txId}: Expected ${expectedCategory} (${expectedSource}), got ${suggestion.category} (${suggestion.source})`,
        );
        allCorrect = false;
      }
    });

    console.log(
      `\n${allCorrect ? '✅ All tests passed!' : '⚠️ Some tests failed'}`,
    );
    console.log(
      `📊 Stats: ${result.stats.claudeCalls} Claude calls, ${result.stats.durationMs}ms`,
    );
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test
testAgent2();
