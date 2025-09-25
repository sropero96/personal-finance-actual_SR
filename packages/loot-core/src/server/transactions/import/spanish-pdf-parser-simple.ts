// @ts-strict-ignore
import * as fs from '../../../platform/server/fs';
import { logger } from '../../../platform/server/log';
import { looselyParseAmount } from '../../../shared/util';

type ParseError = { message: string; internal: string };
type ParseFileResult = {
  errors: ParseError[];
  transactions?: {
    amount: number;
    date: string;
    payee_name: string;
    imported_payee: string;
    notes: string;
  }[];
};

type ParseFileOptions = {
  bankType?: 'santander' | 'bbva' | 'caixabank' | 'sabadell' | 'unknown';
  importNotes?: boolean;
};

/**
 * TEMPORARY: Simple Spanish PDF Parser without MASTRA
 * This is a fallback to test if the issue is with MASTRA integration
 */
export async function parsePDFFromBuffer(
  buffer: Buffer,
  options: ParseFileOptions = {},
): Promise<ParseFileResult> {
  logger.info('🔄 Using TEMPORARY simple PDF parser (no MASTRA)');
  
  try {
    // Simple fallback: return empty transactions for now
    // This will allow the app to load and we can debug the MASTRA integration separately
    
    logger.info('✅ Temporary parser completed - returning empty result');
    
    return {
      errors: [],
      transactions: [
        {
          amount: -10.50,
          date: '2024-01-01',
          payee_name: 'Test Transaction',
          imported_payee: 'Test Transaction',
          notes: 'Temporary test transaction - MASTRA integration disabled'
        }
      ]
    };
    
  } catch (error) {
    logger.error('❌ Error in temporary parser:', error);
    return {
      errors: [{ message: 'Error parsing PDF', internal: error.message }],
      transactions: []
    };
  }
}
