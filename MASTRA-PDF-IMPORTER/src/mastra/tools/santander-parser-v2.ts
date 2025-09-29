import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Funciones de conversión para formatos españoles
function parseSpanishAmount(amountStr: string): number {
  // "7.227,86 EUR" -> 7227.86 o "-6,95 EUR" -> -6.95
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
  description: 'Parse Santander bank PDF statements and extract transaction data using advanced text processing',
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
      if (!/(CUENTA\s+[A-Z]+:|SANTANDER|ES\d{22})/i.test(rawText)) {
        return {
          bankName: 'Unknown',
          transactions: [],
          totalTransactions: 0,
          success: false,
          error: 'This does not appear to be a Santander bank statement'
        };
      }

      // Extraer número de cuenta
      const accountMatch = rawText.match(/ES\d{22}/);
      const accountNumber = accountMatch ? accountMatch[0] : undefined;

      const transactions: SantanderTransaction[] = [];

      // Nueva estrategia: buscar secuencias específicas del formato Santander
      // Basado en el análisis del PDF real, cada transacción sigue este patrón:
      // 1. Fecha de operación (dd/mm/yyyy)  
      // 2. Texto " Fecha valor:dd/mm/yyyy" (puede estar en línea separada)
      // 3. Descripción de la transacción
      // 4. Importe con EUR seguido inmediatamente por saldo con EUR
      
      // Dividir el texto en segmentos que contengan transacciones
      // Mejorar el patrón para aceptar saltos de línea entre fecha y "Fecha valor"
      const transactionSegments = rawText.split(/(?=\d{2}\/\d{2}\/\d{4}(?:\s*\n\s*|\s+)Fecha valor:)/);
      
      for (const segment of transactionSegments) {
        if (segment.trim().length === 0) continue;
        
        // Extraer fecha de operación
        const operationDateMatch = segment.match(/^(\d{2}\/\d{2}\/\d{4})/);
        if (!operationDateMatch) continue;
        
        const operationDate = operationDateMatch[1];
        
        // Extraer fecha valor (permitir saltos de línea)
        const valueDateMatch = segment.match(/Fecha valor:\s*(\d{2}\/\d{2}\/\d{4})/);
        if (!valueDateMatch) continue;
        
        // Buscar el patrón de importe y saldo al final del segmento
        // Patrón mejorado: buscar dos cantidades EUR consecutivas
        const amountBalanceMatch = segment.match(/(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/);
        if (!amountBalanceMatch) continue;
        
        const amountStr = amountBalanceMatch[1];
        const balanceStr = amountBalanceMatch[2];
        
        // Extraer descripción (todo lo que está entre la fecha valor y el importe)
        const descriptionStart = segment.indexOf(valueDateMatch[0]) + valueDateMatch[0].length;
        const descriptionEnd = segment.lastIndexOf(amountBalanceMatch[0]);
        let description = segment.substring(descriptionStart, descriptionEnd).trim();
        
        // Limpiar la descripción
        description = description.replace(/\s+/g, ' ').trim();
        
        // Parsear valores
        const amount = parseSpanishAmount(amountStr + ' EUR');
        const balance = parseSpanishAmount(balanceStr + ' EUR');
        
        const transaction: SantanderTransaction = {
          date: convertSpanishDate(operationDate),
          description: description || 'Transaction',
          amount: amount,
          balance: balance,
          type: amount < 0 ? 'debit' : 'credit',
          rawText: segment.substring(0, Math.min(200, segment.length)) // Primeros 200 chars para referencia
        };
        
        transactions.push(transaction);
      }

      // Si no encontramos transacciones con el método principal, intentar método alternativo
      if (transactions.length === 0) {
        // Buscar todos los patrones de fecha seguidos de importe y saldo
        const alternativePattern = /(\d{2}\/\d{2}\/\d{4})[\s\S]*?(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g;
        
        let match;
        while ((match = alternativePattern.exec(rawText)) !== null) {
          const [fullMatch, dateStr, amountStr, balanceStr] = match;
          
          // Extraer descripción aproximada del contexto
          const contextBefore = rawText.substring(Math.max(0, match.index - 100), match.index);
          const contextAfter = rawText.substring(match.index, match.index + fullMatch.length);
          const description = (contextBefore + contextAfter).replace(/\d{2}\/\d{2}\/\d{4}/g, '').replace(/(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g, '').trim();
          
          const amount = parseSpanishAmount(amountStr + ' EUR');
          const balance = parseSpanishAmount(balanceStr + ' EUR');
          
          transactions.push({
            date: convertSpanishDate(dateStr),
            description: description.substring(0, 100) || 'Transaction (alternative parsing)',
            amount: amount,
            balance: balance,
            type: amount < 0 ? 'debit' : 'credit',
            rawText: fullMatch.substring(0, 150)
          });
        }
      }

      // Eliminar duplicados basados en fecha, importe y saldo
      const uniqueTransactions = transactions.filter((transaction, index, array) => {
        return array.findIndex(t => 
          t.date === transaction.date && 
          t.amount === transaction.amount && 
          t.balance === transaction.balance
        ) === index;
      });

      return {
        bankName: 'Santander',
        accountNumber,
        transactions: uniqueTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        totalTransactions: uniqueTransactions.length,
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
