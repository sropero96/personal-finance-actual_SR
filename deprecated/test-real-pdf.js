#!/usr/bin/env node

console.log('🧪 Testing Real PDF Extraction');
console.log('=' .repeat(50));

const path = require('path');
const { parsePDF } = require('./packages/loot-core/src/server/transactions/import/spanish-pdf-parser');

async function testPDFExtraction() {
  try {
    const pdfPath = path.join(__dirname, 'PDF_MOVIMIENTOS_SANTANDER.pdf');
    console.log('📁 Testing file:', pdfPath);
    
    const result = await parsePDF(pdfPath, {
      bankType: 'santander',
      importNotes: true
    });
    
    console.log('\n📊 RESULTS:');
    console.log('- Errors:', result.errors.length);
    console.log('- Transactions found:', result.transactions?.length || 0);
    
    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      result.errors.forEach(error => {
        console.log(`- ${error.message}: ${error.internal}`);
      });
    }
    
    if (result.transactions && result.transactions.length > 0) {
      console.log('\n✅ SAMPLE TRANSACTIONS:');
      result.transactions.slice(0, 3).forEach((tx, i) => {
        console.log(`${i + 1}. ${tx.date} | ${tx.payee_name} | ${tx.amount} EUR`);
      });
    }
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testPDFExtraction();
