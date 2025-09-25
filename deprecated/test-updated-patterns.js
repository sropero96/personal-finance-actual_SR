#!/usr/bin/env node

console.log('🧪 Testing Updated PDF Patterns with Real Data');
console.log('=' .repeat(55));

const fs = require('fs');
const path = require('path');

// Spanish number parsing function
function parseSpanishAmount(amountStr) {
  try {
    // Convert Spanish format (1.234,56) to English format (1234.56)
    const cleanAmount = amountStr.replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(cleanAmount);
    return isNaN(amount) ? null : amount;
  } catch {
    return null;
  }
}

// Spanish date parsing function
function parseSpanishDate(dateStr) {
  try {
    // Convert DD/MM/YYYY to YYYY-MM-DD format
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

// Updated patterns for real PDF format
const SPANISH_BANK_PATTERNS = [
  {
    type: 'card_payment',
    name: 'Pago Móvil',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Pago\s+Movil\s+En\s+([^,]+),\s*([^,]+),\s*Tarj\.\s*:[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'contactless_payment', 
    name: 'Transacción Contactless',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Transaccion\s+Contactless\s+En\s+([^,]+),\s*([^,]+),\s*Tarj\.\s*:[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'purchase',
    name: 'Compra',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Compra\s+([^,]+),\s*([^,]*),?\s*Tarjeta[\s\S]*?-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'transfer_in',
    name: 'Transferencia Recibida',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Transferencia\s+Inmediata\s+De\s+([^,]+),?(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'transfer_out',
    name: 'Transferencia Enviada',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Transferencia\s+Inmediata\s+A\s+Favor\s+De\s+([^-]+)-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'cash_withdrawal',
    name: 'Retirada de Efectivo',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Retirada\s+De\s+Efectivo\s+En\s+Cajero\s+Automatico[\s\S]*?-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'tax',
    name: 'Impuesto',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Impuesto:\s*([^-]*)-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'traspaso',
    name: 'Traspaso',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Traspaso:-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'refund',
    name: 'Devolución',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Devolucion\s+Compra\s+En\s+([^,]+),\s*([^,]+),?\s*Tarjeta[\s\S]*?(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  },
  {
    type: 'credit_note',
    name: 'Nota de Abono',
    regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Recepcion\s+De\s+Nota\s+De\s+Abono(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
  }
];

async function testRealPDFPatterns() {
  try {
    // Get real PDF text
    const pdfParse = require('pdf-parse');
    const pdfPath = path.join(__dirname, 'PDF_MOVIMIENTOS_SANTANDER.pdf');
    const buffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(buffer);
    const extractedText = pdfData.text;
    
    console.log('📄 Testing with real PDF text (length:', extractedText.length, 'chars)');
    
    const transactions = [];
    let totalMatches = 0;
    
    // Process each pattern
    for (const pattern of SPANISH_BANK_PATTERNS) {
      console.log(`\n🔍 Testing pattern: ${pattern.name}`);
      
      let match;
      let patternMatches = 0;
      while ((match = pattern.regex.exec(extractedText)) !== null) {
        patternMatches++;
        totalMatches++;
        
        let transaction = null;
        
        if (pattern.type === 'card_payment' || pattern.type === 'contactless_payment') {
          const [, dateStr, merchant, location, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: `${merchant}, ${location}`,
            amount: -Math.abs(amount), // Negative for payments
            type: pattern.name
          };
        } else if (pattern.type === 'purchase') {
          const [, dateStr, merchant, location, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: `${merchant}`,
            amount: -Math.abs(amount), // Negative for purchases
            type: pattern.name
          };
        } else if (pattern.type === 'transfer_in') {
          const [, dateStr, sender, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: sender.trim(),
            amount: Math.abs(amount), // Positive for incoming
            type: pattern.name
          };
        } else if (pattern.type === 'transfer_out') {
          const [, dateStr, recipient, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: recipient.trim(),
            amount: -Math.abs(amount), // Negative for outgoing
            type: pattern.name
          };
        } else if (pattern.type === 'cash_withdrawal') {
          const [, dateStr, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: 'Retirada de Efectivo',
            amount: -Math.abs(amount), // Negative for withdrawals
            type: pattern.name
          };
        } else if (pattern.type === 'tax') {
          const [, dateStr, description, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: `Impuesto: ${description.trim()}`,
            amount: -Math.abs(amount), // Negative for taxes
            type: pattern.name
          };
        } else if (pattern.type === 'traspaso') {
          const [, dateStr, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: 'Traspaso',
            amount: -Math.abs(amount), // Negative for transfers
            type: pattern.name
          };
        } else if (pattern.type === 'refund') {
          const [, dateStr, merchant, location, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: `Devolución: ${merchant}`,
            amount: Math.abs(amount), // Positive for refunds
            type: pattern.name
          };
        } else if (pattern.type === 'credit_note') {
          const [, dateStr, amountStr] = match;
          const amount = parseSpanishAmount(amountStr);
          
          transaction = {
            date: parseSpanishDate(dateStr),
            payee_name: 'Nota de Abono',
            amount: Math.abs(amount), // Positive for credits
            type: pattern.name
          };
        }
        
        if (transaction) {
          transactions.push(transaction);
          if (patternMatches <= 2) { // Show first 2 matches per pattern
            console.log(`   ✅ ${transaction.date} | ${transaction.payee_name} | ${transaction.amount} EUR`);
          }
        }
      }
      
      console.log(`   📊 Found ${patternMatches} matches for ${pattern.name}`);
    }
    
    console.log(`\n🎯 FINAL RESULTS:`);
    console.log(`- Total matches: ${totalMatches}`);
    console.log(`- Unique transactions: ${transactions.length}`);
    
    // Sort transactions by date
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    console.log(`\n📋 ALL TRANSACTIONS FOUND:`);
    transactions.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.date} | ${tx.payee_name} | ${tx.amount.toFixed(2)} EUR | ${tx.type}`);
    });
    
    // Calculate totals
    const credits = transactions.filter(tx => tx.amount > 0);
    const debits = transactions.filter(tx => tx.amount < 0);
    const creditTotal = credits.reduce((sum, tx) => sum + tx.amount, 0);
    const debitTotal = debits.reduce((sum, tx) => sum + tx.amount, 0);
    
    console.log(`\n💰 SUMMARY:`);
    console.log(`- Credits: ${credits.length} transactions, +${creditTotal.toFixed(2)} EUR`);
    console.log(`- Debits: ${debits.length} transactions, ${debitTotal.toFixed(2)} EUR`);
    console.log(`- Net: ${(creditTotal + debitTotal).toFixed(2)} EUR`);
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testRealPDFPatterns();
