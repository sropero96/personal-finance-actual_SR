import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Mapeo de meses español para Revolut
const SPANISH_MONTHS = {
  'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04',
  'may': '05', 'jun': '06', 'jul': '07', 'ago': '08', 
  'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
} as const;

// Patrones para Revolut basados en análisis de Fase 0
const REVOLUT_PATTERNS = {
  // Identificador del banco
  bankIdentifier: /Revolut Bank|Revolut/i,
  
  // Formato de fecha español en Revolut (ej: "4 ago 2025")
  dateFormat: /\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+\d{4}/gi,
  
  // Formato de importe con símbolo euro
  amountFormat: /€\d{1,3}(?:\.\d{3})*\.\d{2}/g,
  
  // Línea completa de transacción Revolut
  // Patrón: "4 ago 20255 ago 2025Livraria Lello€1.00€63.37"
  transactionLine: /(\d{1,2}\s+\w{3}\s+\d{4})\d{1,2}\s+\w{3}\s+\d{4}([^€]+)(€\d+\.\d{2})(€\d+\.\d{2})/g,
  
  // Patrón para extraer fechas separadas (procesamiento y transacción)
  doubleDatePattern: /(\d{1,2}\s+\w{3}\s+\d{4})(\d{1,2}\s+\w{3}\s+\d{4})/g,
  
  // Descripción típica de Revolut
  descriptionPattern: /\d{4}([^€]+)€/g,

  // Patrón más flexible para transacciones
  flexibleTransaction: /(\d{1,2}\s+\w{3}\s+\d{4})[^€]*?([^€\n]+?)(€\d+\.\d{2})(€\d+\.\d{2})/g
};

// Funciones de conversión para Revolut
function convertRevolutSpanishDate(dateStr: string): string {
  // "4 ago 2025" -> "2025-08-04"
  const [day, monthStr, year] = dateStr.split(' ');
  const month = SPANISH_MONTHS[monthStr.toLowerCase() as keyof typeof SPANISH_MONTHS];
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function parseRevolutAmount(amountStr: string): number {
  // "€126.20" -> 126.20
  return parseFloat(amountStr.replace('€', ''));
}

interface RevolutTransaction {
  date: string;
  description: string;
  amount: number;
  balance: number;
  type: 'debit' | 'credit';
  rawText: string;
}

export const revolutParserTool = createTool({
  id: 'revolut-parser',
  description: 'Parse Revolut bank PDF statements and extract transaction data using refined Spanish patterns',
  inputSchema: z.object({
    rawText: z.string().describe('Raw text extracted from Revolut PDF'),
  }),
  outputSchema: z.object({
    bankName: z.string().describe('Name of the bank'),
    accountNumber: z.string().optional().describe('Account identifier if available'),
    transactions: z.array(z.object({
      date: z.string().describe('Transaction date in ISO format (YYYY-MM-DD)'),
      description: z.string().describe('Transaction description'),
      amount: z.number().describe('Transaction amount (negative for debits, positive for credits)'),
      balance: z.number().describe('Account balance after transaction'),
      type: z.enum(['debit', 'credit']).describe('Transaction type'),
      rawText: z.string().describe('Original raw text of the transaction line'),
    })),
    totalTransactions: z.number().describe('Total number of transactions found'),
    success: z.boolean().describe('Whether parsing was successful'),
    error: z.string().optional().describe('Error message if parsing failed'),
  }),
  execute: async ({ context }) => {
    const { rawText } = context;
    
    try {
      // Verificar si es un PDF de Revolut
      if (!REVOLUT_PATTERNS.bankIdentifier.test(rawText)) {
        return {
          bankName: 'Unknown',
          transactions: [],
          totalTransactions: 0,
          success: false,
          error: 'This does not appear to be a Revolut bank statement'
        };
      }

      const transactions: RevolutTransaction[] = [];

      // Intentar con patrón principal
      let match;
      REVOLUT_PATTERNS.transactionLine.lastIndex = 0;

      while ((match = REVOLUT_PATTERNS.transactionLine.exec(rawText)) !== null) {
        const [fullMatch, dateStr, description, amountStr, balanceStr] = match;
        
        try {
          const date = convertRevolutSpanishDate(dateStr.trim());
          const amount = parseRevolutAmount(amountStr);
          const balance = parseRevolutAmount(balanceStr);
          const cleanDescription = description.trim();

          // Determinar tipo de transacción
          const type: 'debit' | 'credit' = amount > 0 ? 'credit' : 'debit';

          transactions.push({
            date,
            description: cleanDescription,
            amount,
            balance,
            type,
            rawText: fullMatch
          });
        } catch (parseError) {
          console.warn('Error parsing Revolut transaction:', parseError);
          continue;
        }
      }

      // Si no encontramos transacciones, intentar patrón flexible
      if (transactions.length === 0) {
        REVOLUT_PATTERNS.flexibleTransaction.lastIndex = 0;
        
        while ((match = REVOLUT_PATTERNS.flexibleTransaction.exec(rawText)) !== null) {
          const [fullMatch, dateStr, description, amountStr, balanceStr] = match;
          
          try {
            const date = convertRevolutSpanishDate(dateStr.trim());
            const amount = parseRevolutAmount(amountStr);
            const balance = parseRevolutAmount(balanceStr);
            const cleanDescription = description.trim();

            transactions.push({
              date,
              description: cleanDescription,
              amount,
              balance,
              type: amount > 0 ? 'credit' : 'debit',
              rawText: fullMatch
            });
          } catch (parseError) {
            console.warn('Error parsing flexible Revolut transaction:', parseError);
            continue;
          }
        }
      }

      // Si aún no hay transacciones, intentar extraer fechas e importes por separado
      if (transactions.length === 0) {
        const dates = Array.from(rawText.matchAll(REVOLUT_PATTERNS.dateFormat));
        const amounts = Array.from(rawText.matchAll(REVOLUT_PATTERNS.amountFormat));
        
        // Intentar emparejar fechas con importes (enfoque básico)
        const minLength = Math.min(dates.length, Math.floor(amounts.length / 2));
        
        for (let i = 0; i < minLength; i++) {
          try {
            const dateStr = dates[i][0];
            const amountStr = amounts[i * 2]?.[0]; // Primer importe (transacción)
            const balanceStr = amounts[i * 2 + 1]?.[0]; // Segundo importe (saldo)
            
            if (dateStr && amountStr && balanceStr) {
              const date = convertRevolutSpanishDate(dateStr);
              const amount = parseRevolutAmount(amountStr);
              const balance = parseRevolutAmount(balanceStr);

              transactions.push({
                date,
                description: 'Revolut Transaction (basic extraction)',
                amount,
                balance,
                type: amount > 0 ? 'credit' : 'debit',
                rawText: `${dateStr} ${amountStr} ${balanceStr}`
              });
            }
          } catch (parseError) {
            console.warn('Error in basic Revolut extraction:', parseError);
            continue;
          }
        }
      }

      return {
        bankName: 'Revolut',
        accountNumber: undefined, // Revolut no suele mostrar número de cuenta tradicional
        transactions: transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        totalTransactions: transactions.length,
        success: true
      };

    } catch (error) {
      return {
        bankName: 'Revolut',
        transactions: [],
        totalTransactions: 0,
        success: false,
        error: `Failed to parse Revolut PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});
