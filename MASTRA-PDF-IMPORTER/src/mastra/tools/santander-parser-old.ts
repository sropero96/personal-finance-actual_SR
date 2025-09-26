import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Mapeo de meses español
const SPANISH_MONTHS = {
  'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04',
  'may': '05', 'jun': '06', 'jul': '07', 'ago': '08', 
  'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
} as const;

// Patrones para Santander basados en análisis detallado del PDF real
const SANTANDER_PATTERNS = {
  // Identificador del banco
  bankIdentifier: /CUENTA\s+[A-Z]+:|SANTANDER|ES\d{22}/i,
  
  // Número de cuenta español (IBAN)
  accountNumber: /ES\d{22}/g,
  
  // Formato de fecha español
  dateFormat: /\d{2}\/\d{2}\/\d{4}/g,
  
  // Formato de importe español (con puntos de miles y coma decimal)
  amountFormat: /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g,
  
  // Patrón principal: transacciones con estructura completa
  // Captura: fecha operación, fecha valor, descripción, importe, saldo
  fullTransaction: /(\d{2}\/\d{2}\/\d{4})\s*Fecha valor:(\d{2}\/\d{2}\/\d{4})\s*([^-+\d]*?)(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g,
  
  // Patrón para transacciones que aparecen en líneas separadas
  // Estructura: fecha -> descripción multilínea -> importe y saldo
  separatedTransaction: /(\d{2}\/\d{2}\/\d{4})\s+Fecha valor:\d{2}\/\d{2}\/\d{4}\s+([^-+]*?)(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g,
  
  // Patrón de respaldo para capturas simples
  simpleTransaction: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g
};

// Funciones de conversión para formatos españoles
function parseSpanishAmount(amountStr: string): number {
  // "7.227,86 EUR" -> 7227.86
  return parseFloat(amountStr.replace(/\./g, '').replace(',', '.').replace(' EUR', ''));
}

function convertSpanishDate(dateStr: string): string {
  // "26/08/2025" -> "2025-08-26"
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

interface SantanderTransaction {
  date: string;
  description: string;
  amount: number;
  balance: number;
  type: 'debit' | 'credit';
  rawText: string;
}

export const santanderParserTool = createTool({
  id: 'santander-parser',
  description: 'Parse Santander bank PDF statements and extract transaction data using refined Spanish patterns',
  inputSchema: z.object({
    rawText: z.string().describe('Raw text extracted from Santander PDF'),
  }),
  outputSchema: z.object({
    bankName: z.string().describe('Name of the bank'),
    accountNumber: z.string().optional().describe('Account number (IBAN)'),
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
      // Verificar si es un PDF de Santander
      if (!SANTANDER_PATTERNS.bankIdentifier.test(rawText)) {
        return {
          bankName: 'Unknown',
          transactions: [],
          totalTransactions: 0,
          success: false,
          error: 'This does not appear to be a Santander bank statement'
        };
      }

      // Extraer número de cuenta
      const accountMatch = rawText.match(SANTANDER_PATTERNS.accountNumber);
      const accountNumber = accountMatch ? accountMatch[0] : undefined;

      const transactions: SantanderTransaction[] = [];

      // Estrategia 1: Patrón completo para transacciones en una sola línea
      let match;
      SANTANDER_PATTERNS.fullTransaction.lastIndex = 0;

      while ((match = SANTANDER_PATTERNS.fullTransaction.exec(rawText)) !== null) {
        const [fullMatch, operationDate, valueDate, description, amountStr, balanceStr] = match;
        
        try {
          const balance = parseSpanishAmount(balanceStr + ' EUR');
          const amount = parseSpanishAmount(amountStr + ' EUR');
          const date = convertSpanishDate(operationDate);
          const cleanDescription = description.trim();

          // Determinar tipo de transacción (asumiendo que gastos son negativos)
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
          console.warn('Error parsing transaction:', parseError);
          continue;
        }
      }

      // Si no encontramos transacciones con el patrón complejo, intentar patrón simple
      if (transactions.length === 0) {
        SANTANDER_PATTERNS.simpleTransaction.lastIndex = 0;
        
        while ((match = SANTANDER_PATTERNS.simpleTransaction.exec(rawText)) !== null) {
          const [fullMatch, dateStr, amountStr] = match;
          
          try {
            const amount = parseSpanishAmount(amountStr + ' EUR');
            const date = convertSpanishDate(dateStr);
            
            transactions.push({
              date,
              description: 'Transaction (simplified extraction)',
              amount,
              balance: 0, // No disponible en patrón simple
              type: amount > 0 ? 'credit' : 'debit',
              rawText: fullMatch
            });
          } catch (parseError) {
            console.warn('Error parsing simple transaction:', parseError);
            continue;
          }
        }
      }

      return {
        bankName: 'Santander',
        accountNumber,
        transactions: transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        totalTransactions: transactions.length,
        success: true
      };

    } catch (error) {
      return {
        bankName: 'Santander',
        transactions: [],
        totalTransactions: 0,
        success: false,
        error: `Failed to parse Santander PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});
