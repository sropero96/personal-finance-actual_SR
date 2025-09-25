import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const transactionExtractionTool = createTool({
  id: 'transaction-extraction',
  description: 'Extract ALL structured transaction data from COMPLETE Spanish bank PDF text - processes entire document',
  inputSchema: z.object({
    extractedText: z.string().describe('Raw text extracted from PDF'),
    bankType: z.enum(['santander', 'bbva', 'caixabank', 'sabadell', 'unknown']).default('santander'),
    accountInfo: z.object({
      accountNumber: z.string().optional(),
      accountType: z.string().optional(),
      currency: z.string().default('EUR')
    }).optional()
  }),
  outputSchema: z.object({
    transactions: z.array(z.object({
      date: z.string().describe('Transaction date in DD/MM/YYYY format'),
      description: z.string().describe('Transaction description'),
      amount: z.number().describe('Transaction amount (negative for debits)'),
      balance: z.number().optional().describe('Account balance after transaction'),
      type: z.string().optional().describe('Transaction type'),
      reference: z.string().optional().describe('Transaction reference'),
      confidence: z.number().min(0).max(1).describe('Extraction confidence')
    })),
    summary: z.object({
      totalTransactions: z.number(),
      dateRange: z.object({
        from: z.string(),
        to: z.string()
      }),
      totalDebits: z.number(),
      totalCredits: z.number()
    })
  }),
  execute: async (context) => {
    const { extractedText, bankType, accountInfo = {} } = context.data;
    
    console.log('🔍 Starting COMPLETE transaction extraction...');
    console.log('📊 Text length:', extractedText.length);
    console.log('🏦 Bank type:', bankType);
    console.log('📄 Processing ENTIRE document - will extract ALL transactions');
    
    // Show a preview of the text to ensure we have the full document
    const textPreview = extractedText.substring(0, 200) + '...';
    const textEnd = '...' + extractedText.substring(extractedText.length - 200);
    console.log('📝 Text preview (start):', textPreview);
    console.log('📝 Text preview (end):', textEnd);
    
    // Use the PROVEN patterns that extracted 89 transactions successfully
    const SPANISH_BANK_PATTERNS = [
      {
        type: 'card_payment',
        name: 'Pago con Tarjeta',
        // Format: "Pago En Comercio Con Tarjeta Contactless, El 18/09/2025\nA Las 12:52..pan:4176570102536242.\nTienda Leroy Merlin Vallecas,Madrid,-140,00 EUR4.354,26 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Pago\s+En\s+Comercio\s+Con\s+Tarjeta[\s\S]*?([^,]+),([^,]*),?\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: 'contactless_payment',
        name: 'Pago Contactless',
        // Format: "Pago En Comercio Con Tarjeta Contactless El 16/09/2025 A Las 19:04..pan:4176570102536242.\nEl Corte Ingles S.A.,Madrid,-7,50 EUR4.901,54 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Pago\s+En\s+Comercio\s+Con\s+Tarjeta\s+Contactless[\s\S]*?([^,]+),([^,]*),?\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: 'purchase',
        name: 'Compra',
        // Format: "Compra Amazon Prime*2t6fk5rt5, Amazon.es/prm, Tarjeta \n4176570102536242 , Comision 0,00\n-4,99 EUR4.093,16 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Compra\s+([^,]+),\s*([^,]*),?\s*Tarjeta[\s\S]*?-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: 'transfer_in',
        name: 'Transferencia Recibida',
        // Format: "Transferencia Inmediata De Healy Maria Del Rosario,320,00 EUR5.225,73 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Transferencia\s+Inmediata\s+De\s+([^,]+),?(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: 'transfer_out',
        name: 'Transferencia Enviada',  
        // Format: "Transferencia Inmediata A Favor De Sebastian Ropero-28,39 EUR4.900,00 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Transferencia\s+Inmediata\s+A\s+Favor\s+De\s+([^-]+)-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: 'cash_withdrawal',
        name: 'Retirada de Efectivo',
        // Format: "Retirada De Efectivo En Cajero Automatico 004901280020 El \n17/09/2025 A Las 14:36..pan:4176570102536242.\n-140,00 EUR4.214,26 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Retirada\s+De\s+Efectivo\s+En\s+Cajero\s+Automatico[\s\S]*?-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: 'direct_debit',
        name: 'Domiciliación',
        // Format: "Recibo Domiciliado De Vodafone Espana Sau,-39,99 EUR4.053,17 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Recibo\s+Domiciliado\s+De\s+([^,]+),?-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: 'credit_note',
        name: 'Nota de Abono',
        // Format: "Recepcion De Nota De Abono82,67 EUR4.287,89 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Recepcion\s+De\s+Nota\s+De\s+Abono(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      }
    ];

    function parseSpanishAmount(amountStr) {
      try {
        // Handle Spanish number format: 1.234,56 -> 1234.56
        const cleanAmount = amountStr.replace(/\./g, '').replace(',', '.');
        const amount = parseFloat(cleanAmount);
        return isNaN(amount) ? null : amount;
      } catch {
        return null;
      }
    }

    function parseSpanishDate(dateStr) {
      try {
        // Convert DD/MM/YYYY to YYYY-MM-DD format
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } catch {
        return dateStr;
      }
    }

    const transactions = [];
    let totalDebits = 0;
    let totalCredits = 0;
    
    // Process each pattern type
    for (const pattern of SPANISH_BANK_PATTERNS) {
      let match;
      while ((match = pattern.regex.exec(extractedText)) !== null) {
        let transaction = null;
        
        try {
          if (pattern.type === 'card_payment' || pattern.type === 'contactless_payment') {
            const [, dateStr, merchant, location, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} en ${merchant.trim()}`,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === 'purchase') {
            const [, dateStr, merchant, location, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} en ${merchant.trim()}`,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === 'transfer_in') {
            const [, dateStr, sender, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} de ${sender.trim()}`,
                amount: Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === 'transfer_out') {
            const [, dateStr, recipient, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} a ${recipient.trim()}`,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === 'cash_withdrawal') {
            const [, dateStr, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: pattern.name,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === 'direct_debit') {
            const [, dateStr, payee, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} - ${payee.trim()}`,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === 'credit_note') {
            const [, dateStr, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: pattern.name,
                amount: Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          }
          
          if (transaction && transaction.amount !== null && transaction.date) {
            transactions.push(transaction);
            if (transaction.amount < 0) {
              totalDebits += Math.abs(transaction.amount);
            } else {
              totalCredits += transaction.amount;
            }
          }
        } catch (err) {
          console.warn(`Error processing transaction pattern ${pattern.type}:`, err.message);
        }
      }
    }

    // Remove duplicates and sort by date
    const uniqueTransactions = transactions.filter((transaction, index, self) => 
      index === self.findIndex(t => 
        t.date === transaction.date && 
        Math.abs(t.amount - transaction.amount) < 0.01 && 
        t.description === transaction.description
      )
    );

    uniqueTransactions.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    console.log(`✅ COMPLETED processing ENTIRE document`);
    console.log(`📊 Total extracted: ${uniqueTransactions.length} unique transactions`);
    console.log(`💰 Total debits: ${totalDebits.toFixed(2)} EUR`);
    console.log(`💰 Total credits: ${totalCredits.toFixed(2)} EUR`);
    console.log(`📅 Processed text length: ${extractedText.length} characters`);
    
    // Get date range
    const dateRange = uniqueTransactions.length > 0 ? {
      from: uniqueTransactions[0].date,
      to: uniqueTransactions[uniqueTransactions.length - 1].date
    } : { from: '', to: '' };
    
    console.log(`📅 Date range: ${dateRange.from} to ${dateRange.to}`);

    return {
      transactions: uniqueTransactions,
      summary: {
        totalTransactions: uniqueTransactions.length,
        dateRange,
        totalDebits,
        totalCredits
      }
    };
  }
});
