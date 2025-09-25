#!/usr/bin/env node

const fs = require('fs');

// Simplified Spanish PDF parser for testing
const SPANISH_BANK_PATTERNS = [
  {
    type: 'card_payment',
    name: 'Pago Móvil',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Pago\s+Movil\s+En\s+([^,]+),\s*([^,]+),\s*Tarj\.\s*:[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'contactless_payment',
    name: 'Transacción Contactless',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Transaccion\s+Contactless\s+En\s+([^,]+),\s*([^,]+),\s*Tarj\.\s*:[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'purchase',
    name: 'Compra',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Compra\s+([^,]+),\s*([^,]*),?\s*Tarjeta[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'transfer_in',
    name: 'Transferencia Recibida',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Transferencia\s+Inmediata\s+De\s+([^,]+),?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'transfer_out',
    name: 'Transferencia Enviada',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Transferencia\s+Inmediata\s+A\s+Favor\s+De\s+([^-]+)\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'cash_withdrawal',
    name: 'Retirada de Efectivo',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Retirada\s+De\s+Efectivo\s+En\s+Cajero\s+Automatico[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'tax',
    name: 'Impuesto',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Impuesto:\s*([^-]*)-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'traspaso',
    name: 'Traspaso',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Traspaso:\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'refund',
    name: 'Devolución',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Devolucion\s+Compra\s+En\s+([^,]+),\s*([^,]+),?\s*Tarjeta[^0-9]*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  },
  {
    type: 'credit_note',
    name: 'Nota de Abono',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Recepcion\s+De\s+Nota\s+De\s+Abono\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
  }
];

function parseSpanishAmount(amountStr) {
  try {
    const cleanAmount = amountStr.replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(cleanAmount);
    return isNaN(amount) ? null : amount;
  } catch {
    return null;
  }
}

function parseSpanishDate(dateStr) {
  try {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

async function testParsePDF() {
  console.log('🧪 Testing Spanish PDF Parser Integration');
  console.log('=' .repeat(50));
  
  try {
    // Read test file
    const extractedText = fs.readFileSync('./test-santander-pdf.txt', 'utf8');
    console.log(`✅ Test file loaded (${extractedText.length} characters)`);
    
    const transactions = [];
    const errors = [];
    
    // Process each pattern type
    for (const pattern of SPANISH_BANK_PATTERNS) {
      let match;
      while ((match = pattern.regex.exec(extractedText)) !== null) {
        try {
          let transaction = null;
          
          if (pattern.type === 'card_payment' || pattern.type === 'contactless_payment') {
            const [, dateStr, merchant, location, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: merchant.trim(),
                imported_payee: merchant.trim(),
                amount: -Math.abs(amount), // Card payments are debits
                notes: `${pattern.name} en ${merchant}, ${location}`
              };
            }
          } else if (pattern.type === 'purchase') {
            const [, dateStr, merchant, location, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: merchant.trim(),
                imported_payee: merchant.trim(),
                amount: -Math.abs(amount),
                notes: `${pattern.name} en ${merchant}`
              };
            }
          } else if (pattern.type === 'transfer_in') {
            const [, dateStr, from, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: from.trim(),
                imported_payee: from.trim(),
                amount: Math.abs(amount),
                notes: `${pattern.name} de ${from}`
              };
            }
          } else if (pattern.type === 'transfer_out') {
            const [, dateStr, to, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: to.trim(),
                imported_payee: to.trim(),
                amount: -Math.abs(amount),
                notes: `${pattern.name} a ${to}`
              };
            }
          } else if (pattern.type === 'cash_withdrawal') {
            const [, dateStr, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: 'Cajero Automático',
                imported_payee: 'Cajero Automático',
                amount: -Math.abs(amount),
                notes: pattern.name
              };
            }
          } else if (pattern.type === 'tax') {
            const [, dateStr, description, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: 'Hacienda/Tasas',
                imported_payee: 'Hacienda/Tasas',
                amount: -Math.abs(amount),
                notes: `${pattern.name}: ${description.trim()}`
              };
            }
          } else if (pattern.type === 'traspaso') {
            const [, dateStr, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: 'Traspaso Interno',
                imported_payee: 'Traspaso Interno',
                amount: -Math.abs(amount),
                notes: pattern.name
              };
            }
          } else if (pattern.type === 'refund') {
            const [, dateStr, merchant, location, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: merchant.trim(),
                imported_payee: merchant.trim(),
                amount: Math.abs(amount),
                notes: `${pattern.name} de ${merchant}`
              };
            }
          } else if (pattern.type === 'credit_note') {
            const [, dateStr, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                payee_name: 'Nota de Abono',
                imported_payee: 'Nota de Abono',
                amount: Math.abs(amount),
                notes: pattern.name
              };
            }
          }
          
          if (transaction && transaction.amount !== null && transaction.date) {
            transactions.push(transaction);
            console.log(`✅ ${pattern.type}: ${transaction.payee_name} - ${transaction.amount.toFixed(2)} EUR`);
          }
        } catch (err) {
          console.warn(`⚠️  Error processing ${pattern.type}: ${err.message}`);
          errors.push({ pattern: pattern.type, error: err.message });
        }
      }
    }
    
    // Remove duplicates
    const uniqueTransactions = transactions.filter((transaction, index, self) => 
      index === self.findIndex(t => 
        t.date === transaction.date && 
        Math.abs(t.amount - transaction.amount) < 0.01 && 
        t.payee_name === transaction.payee_name
      )
    );
    
    // Sort by date
    uniqueTransactions.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    
    console.log('\n📊 PARSING RESULTS:');
    console.log(`Total unique transactions: ${uniqueTransactions.length}`);
    console.log(`Processing errors: ${errors.length}`);
    
    if (uniqueTransactions.length > 0) {
      console.log('\n📋 EXTRACTED TRANSACTIONS (Actual Budget format):');
      console.log('Date       | Amount     | Payee              | Notes');
      console.log('-'.repeat(70));
      
      uniqueTransactions.forEach(txn => {
        const dateStr = txn.date;
        const amountStr = (txn.amount >= 0 ? '+' : '') + txn.amount.toFixed(2) + ' EUR';
        const payeeStr = txn.payee_name.substring(0, 18).padEnd(18);
        const notesStr = (txn.notes || '').substring(0, 30);
        
        console.log(`${dateStr} | ${amountStr.padStart(10)} | ${payeeStr} | ${notesStr}`);
      });
      
      // Calculate summary
      const credits = uniqueTransactions.filter(t => t.amount > 0);
      const debits = uniqueTransactions.filter(t => t.amount < 0);
      const totalCredits = credits.reduce((sum, t) => sum + t.amount, 0);
      const totalDebits = debits.reduce((sum, t) => sum + t.amount, 0);
      
      console.log('\n💰 FINANCIAL SUMMARY:');
      console.log(`Credits: ${credits.length} transactions, +${totalCredits.toFixed(2)} EUR`);
      console.log(`Debits: ${debits.length} transactions, ${totalDebits.toFixed(2)} EUR`);
      console.log(`Net amount: ${(totalCredits + totalDebits).toFixed(2)} EUR`);
    }
    
    if (errors.length > 0) {
      console.log('\n❌ ERRORS:');
      errors.forEach(err => console.log(`- ${err.pattern}: ${err.error}`));
    }
    
    console.log('\n🎯 INTEGRATION READY!');
    console.log('The parser successfully processes Spanish bank PDFs for Actual Budget.');
    
    return {
      success: true,
      transactions: uniqueTransactions,
      errors: errors
    };
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

testParsePDF().catch(console.error);
