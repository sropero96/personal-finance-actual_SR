import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const enhancedTransactionExtractionTool = createTool({
  id: 'enhanced-transaction-extraction',
  description: 'Extract structured transaction data from Spanish Santander bank PDF text with optimized patterns based on real data',
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
      merchant: z.string().optional().describe('Merchant name'),
      location: z.string().optional().describe('Transaction location'),
      amount: z.number().describe('Transaction amount (negative for debits)'),
      balance: z.number().optional().describe('Account balance after transaction'),
      type: z.string().describe('Transaction type (card_payment, purchase, transfer, etc.)'),
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
      totalCredits: z.number(),
      accountNumber: z.string().optional(),
      finalBalance: z.number().optional()
    })
  }),
  execute: async (context) => {
    const { extractedText, bankType, accountInfo = {} } = context.data;
    
    // Real Santander patterns extracted from actual PDF analysis
    const santanderPatterns = [
      {
        type: 'card_payment',
        name: 'Pago Móvil',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Pago\s+Movil\s+En\s+([^,]+),\s*([^,]+),\s*Tarj\.\s*:[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'contactless_payment',
        name: 'Transacción Contactless',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Transaccion\s+Contactless\s+En\s+([^,]+),\s*([^,]+),\s*Tarj\.\s*:[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'purchase',
        name: 'Compra',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Compra\s+([^,]+),\s*([^,]*),?\s*Tarjeta[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'transfer_in',
        name: 'Transferencia Recibida',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Transferencia\s+Inmediata\s+De\s+([^,]+),?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'transfer_out',
        name: 'Transferencia Enviada',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Transferencia\s+Inmediata\s+A\s+Favor\s+De\s+([^-]+)\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'cash_withdrawal',
        name: 'Retirada de Efectivo',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Retirada\s+De\s+Efectivo\s+En\s+Cajero\s+Automatico[^-]*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'tax',
        name: 'Impuesto',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Impuesto:\s*([^-]*)-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'traspaso',
        name: 'Traspaso',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Traspaso:\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'refund',
        name: 'Devolución',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Devolucion\s+Compra\s+En\s+([^,]+),\s*([^,]+),?\s*Tarjeta[^0-9]*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      },
      {
        type: 'credit_note',
        name: 'Nota de Abono',
        regex: /(\d{2}\/\d{2}\/\d{4})\s+Recepcion\s+De\s+Nota\s+De\s+Abono\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gm
      }
    ];
    
    const transactions: Array<{
      date: string;
      description: string;
      merchant?: string;
      location?: string;
      amount: number;
      balance?: number;
      type: string;
      reference?: string;
      confidence: number;
    }> = [];
    
    // Extract account info from header
    const accountMatch = extractedText.match(/CUENTA\s+[A-Z\s]*:\s*(ES\d{22})/);
    const accountNumber = accountMatch ? accountMatch[1] : accountInfo.accountNumber;
    
    const finalBalanceMatch = extractedText.match(/Saldo:\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/);
    const finalBalance = finalBalanceMatch ? parseFloat(finalBalanceMatch[1].replace(/\./g, '').replace(',', '.')) : undefined;
    
    // Process each pattern type
    for (const pattern of santanderPatterns) {
      let match;
      while ((match = pattern.regex.exec(extractedText)) !== null) {
        let transaction;
        
        if (pattern.type === 'card_payment' || pattern.type === 'contactless_payment') {
          const [, dateStr, merchant, location, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: `${pattern.name} en ${merchant}`,
            merchant: merchant.trim(),
            location: location.trim(),
            amount: -parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        } else if (pattern.type === 'purchase') {
          const [, dateStr, merchant, location, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: `${pattern.name} en ${merchant}`,
            merchant: merchant.trim(),
            location: location || '',
            amount: -parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        } else if (pattern.type === 'transfer_in') {
          const [, dateStr, from, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: `${pattern.name} de ${from}`,
            merchant: from.trim(),
            amount: parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        } else if (pattern.type === 'transfer_out') {
          const [, dateStr, to, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: `${pattern.name} a ${to}`,
            merchant: to.trim(),
            amount: -parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        } else if (pattern.type === 'cash_withdrawal') {
          const [, dateStr, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: pattern.name,
            amount: -parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        } else if (pattern.type === 'tax') {
          const [, dateStr, description, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: `${pattern.name}: ${description.trim()}`,
            amount: -parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        } else if (pattern.type === 'traspaso') {
          const [, dateStr, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: pattern.name,
            amount: -parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        } else if (pattern.type === 'refund') {
          const [, dateStr, merchant, location, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: `${pattern.name} de ${merchant}`,
            merchant: merchant.trim(),
            location: location || '',
            amount: parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        } else if (pattern.type === 'credit_note') {
          const [, dateStr, amountStr, balanceStr] = match;
          transaction = {
            date: dateStr,
            description: pattern.name,
            amount: parseFloat(amountStr.replace(/\./g, '').replace(',', '.')),
            balance: parseFloat(balanceStr.replace(/\./g, '').replace(',', '.')),
            type: pattern.type,
            confidence: 0.95
          };
        }
        
        if (transaction) {
          transactions.push(transaction);
        }
      }
    }
    
    // Remove duplicates and sort by date
    const uniqueTransactions = transactions.filter((transaction, index, self) => 
      index === self.findIndex(t => 
        t.date === transaction.date && 
        t.amount === transaction.amount && 
        t.description === transaction.description
      )
    );
    
    uniqueTransactions.sort((a, b) => {
      const [dayA, monthA, yearA] = a.date.split('/').map(Number);
      const [dayB, monthB, yearB] = b.date.split('/').map(Number);
      const dateA = new Date(yearA, monthA - 1, dayA);
      const dateB = new Date(yearB, monthB - 1, dayB);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Calculate summary
    const amounts = uniqueTransactions.map(t => t.amount);
    const dates = uniqueTransactions.map(t => t.date);
    
    const summary = {
      totalTransactions: uniqueTransactions.length,
      dateRange: {
        from: dates[0] || '',
        to: dates[dates.length - 1] || ''
      },
      totalDebits: amounts.filter(a => a < 0).reduce((sum, a) => sum + a, 0),
      totalCredits: amounts.filter(a => a > 0).reduce((sum, a) => sum + a, 0),
      accountNumber,
      finalBalance
    };
    
    console.log(`Extracted ${uniqueTransactions.length} transactions from ${bankType} statement`);
    console.log(`Date range: ${summary.dateRange.from} to ${summary.dateRange.to}`);
    console.log(`Total debits: €${summary.totalDebits.toFixed(2)}, Total credits: €${summary.totalCredits.toFixed(2)}`);
    
    return { transactions: uniqueTransactions, summary };
  }
});
