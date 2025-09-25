#!/usr/bin/env node

// Test script for enhanced transaction extraction tool with real Santander PDF data
const fs = require('fs');

// Real Santander PDF text from the actual PDF
const realSantanderText = `TITULAR: ROPERO SEBASTIAN
CUENTA SEBASTIAN: ES2400497175032810076563
Saldo: 3.847,32 EUR (a fecha 25/09/2025) Retenciones : 17,99 EUR
Movimientos de cuenta del 1 Septiembre 2025 al 25 Septiembre 2025
Fecha operación Operación Importe Saldo
25/09/2025 Pago Movil En Saint Georges, Madrid, Tarj. :*536242 -6,00 EUR 3.847,32 EUR                                                                                 Fecha valor: 25/09/2025
24/09/2025 Impuesto: 2025 Tasas Del Tesoro. -28,87 EUR 3.853,32 EUR
Fecha valor: 24/09/2025
24/09/2025 Traspaso: -50,00 EUR 3.882,19 EUR
Fecha valor: 24/09/2025
24/09/2025 Pago Movil En Bazar Chen, Madrid, Tarj. :*536242 -3,25 EUR 3.932,19 EUR
Fecha valor: 24/09/2025
23/09/2025 Pago Movil En Diazsan Product, Madrid, Tarj. :*536242 -12,14 EUR 3.935,44 EUR                                                                              Fecha valor: 23/09/2025
17/09/2025 Recepcion De Nota De Abono 82,67 EUR 4.287,89 EUR
Fecha valor: 15/09/2025
17/09/2025 Retirada De Efectivo En Cajero Automatico 004901280020 El -140,00 EUR 4.214,26 EUR                                                                         Fecha valor: 17/09/2025 17/09/2025 A Las 14:36..pan:4176570102536242.
15/09/2025 Compra Openai, Openai.com, Tarjeta 4176570102536242 , -4,43 EUR 4.415,45 EUR                                                                               Fecha valor: 11/09/2025 Comision 0,13
10/09/2025 Devolucion Compra En Mgp*wallapop S L, Barcelona, Tarjeta 37,78 EUR 4.664,46 EUR                                                                           Fecha valor: 08/09/2025 4176570102536242 , Comision 0,00
08/09/2025 Transferencia Inmediata A Favor De Sebastian Ropero -28,39 EUR 4.900,00 EUR                                                                                Fecha valor: 08/09/2025
01/09/2025 Transferencia Inmediata De Healy Maria Del Rosario, 320,00 EUR 5.225,73 EUR                                                                                Fecha valor: 01/09/2025
02/09/2025 Transaccion Contactless En Saint Georges C, Madrid, Tarj. : -3,00 EUR 5.220,83 EUR                                                                         Fecha valor: 02/09/2025 *536242
01/09/2025 Transferencia Inmediata A Favor De Mercedes Ubierna -1.800,00 EUR 4.944,90 EUR                                                                             Fecha valor: 01/09/2025 Pesquera Concepto Alquiler Septiembre`;

// Enhanced regex patterns based on real PDF analysis
const testPatterns = [
  {
    type: 'card_payment',
    name: 'Pago Móvil',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Pago\s+Movil\s+En\s+([^,]+),\s*([^,]+),\s*Tarj\.\s*:[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 4 // Saint Georges, Bazar Chen, Diazsan Product, etc.
  },
  {
    type: 'contactless_payment',
    name: 'Transacción Contactless',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Transaccion\s+Contactless\s+En\s+([^,]+),\s*([^,]+),\s*Tarj\.\s*:[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 1 // Saint Georges C
  },
  {
    type: 'purchase',
    name: 'Compra',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Compra\s+([^,]+),\s*([^,]*),?\s*Tarjeta[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 1 // OpenAI
  },
  {
    type: 'transfer_in',
    name: 'Transferencia Recibida',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Transferencia\s+Inmediata\s+De\s+([^,]+),?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 1 // Healy Maria Del Rosario
  },
  {
    type: 'transfer_out',
    name: 'Transferencia Enviada',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Transferencia\s+Inmediata\s+A\s+Favor\s+De\s+([^-]+)\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 2 // Sebastian Ropero, Mercedes Ubierna
  },
  {
    type: 'cash_withdrawal',
    name: 'Retirada de Efectivo',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Retirada\s+De\s+Efectivo\s+En\s+Cajero\s+Automatico[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 1 // ATM withdrawal
  },
  {
    type: 'tax',
    name: 'Impuesto',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Impuesto:\s*([^-]*)-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 1 // Tasas Del Tesoro
  },
  {
    type: 'traspaso',
    name: 'Traspaso',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Traspaso:\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 1 // Traspaso
  },
  {
    type: 'refund',
    name: 'Devolución',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Devolucion\s+Compra\s+En\s+([^,]+),\s*([^,]+),?\s*Tarjeta[^0-9]*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 1 // Wallapop refund
  },
  {
    type: 'credit_note',
    name: 'Nota de Abono',
    regex: /(\d{2}\/\d{2}\/\d{4})\s+Recepcion\s+De\s+Nota\s+De\s+Abono\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm,
    expectedMatches: 1 // Credit note
  }
];

console.log('🔍 Testing Enhanced Transaction Extraction Patterns with Real Santander PDF Data\n');
console.log('Real PDF Sample Text Length:', realSantanderText.length, 'characters\n');

let totalMatches = 0;
let totalExpected = 0;

testPatterns.forEach(pattern => {
  console.log(`\n📋 Testing: ${pattern.name} (${pattern.type})`);
  console.log('Expected matches:', pattern.expectedMatches);
  
  const matches = [];
  let match;
  const regex = new RegExp(pattern.regex);
  
  while ((match = regex.exec(realSantanderText)) !== null) {
    matches.push(match);
  }
  
  console.log('Actual matches:', matches.length);
  
  if (matches.length > 0) {
    console.log('✅ Sample matches:');
    matches.slice(0, 2).forEach((match, index) => {
      console.log(`  ${index + 1}. Date: ${match[1]}, Description: ${match[0].substring(0, 80)}...`);
    });
  } else {
    console.log('❌ No matches found');
  }
  
  totalMatches += matches.length;
  totalExpected += pattern.expectedMatches;
  
  if (matches.length === pattern.expectedMatches) {
    console.log('🎯 Perfect match count!');
  } else if (matches.length > 0) {
    console.log('⚠️  Match count differs from expected');
  }
});

console.log(`\n📊 SUMMARY:`);
console.log(`Total patterns tested: ${testPatterns.length}`);
console.log(`Total matches found: ${totalMatches}`);
console.log(`Total matches expected: ${totalExpected}`);
console.log(`Success rate: ${((totalMatches / totalExpected) * 100).toFixed(1)}%`);

// Test account info extraction
const accountMatch = realSantanderText.match(/CUENTA\s+[A-Z\s]*:\s*(ES\d{22})/);
const balanceMatch = realSantanderText.match(/Saldo:\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/);

console.log(`\n🏦 ACCOUNT INFO EXTRACTION:`);
console.log(`Account Number: ${accountMatch ? accountMatch[1] : 'Not found'}`);
console.log(`Final Balance: ${balanceMatch ? balanceMatch[1] + ' EUR' : 'Not found'}`);

console.log('\n✅ Pattern testing completed! The enhanced extraction tool should perform well with real Santander PDFs.');
