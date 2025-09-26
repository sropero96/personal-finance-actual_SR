import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';

export const pdfReaderTool = createTool({
  id: 'pdf-reader',
  description: 'Extract text content from PDF files for bank statement processing',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the PDF file to read'),
  }),
  outputSchema: z.object({
    rawText: z.string().describe('Raw extracted text from PDF'),
    pageCount: z.number().describe('Number of pages in the PDF'),
    success: z.boolean().describe('Whether the extraction was successful'),
    error: z.string().optional().describe('Error message if extraction failed'),
  }),
  execute: async ({ context }) => {
    const { filePath } = context;
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          rawText: '',
          pageCount: 0,
          success: false,
          error: `PDF file not found: ${filePath}`
        };
      }

      // Read PDF buffer
      const pdfBuffer = fs.readFileSync(filePath);
      
      // Dynamic import of pdf-parse to avoid issues with ESM
      // @ts-ignore - pdf-parse doesn't have proper TypeScript declarations
      const pdfParse = (await import('pdf-parse')).default;
      
      // Parse PDF content
      const pdfData = await pdfParse(pdfBuffer);

      return {
        rawText: pdfData.text,
        pageCount: pdfData.numpages,
        success: true
      };

    } catch (error) {
      return {
        rawText: '',
        pageCount: 0,
        success: false,
        error: `Failed to read PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});
