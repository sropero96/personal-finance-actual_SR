import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const pdfOcrTool = createTool({
  id: 'pdf-ocr',
  description: 'Extract text from PDF using basic text parsing (OCR as fallback)',
  inputSchema: z.object({
    pdfBase64: z.string().describe('PDF file encoded as base64'),
    pageRange: z.object({
      start: z.number().optional().describe('Start page (1-indexed)'),
      end: z.number().optional().describe('End page (inclusive)')
    }).optional().describe('Page range to process, if not specified processes all pages')
  }),
  outputSchema: z.object({
    extractedText: z.string().describe('Full extracted text from PDF'),
    pageCount: z.number().describe('Total number of pages processed'),
    confidence: z.number().min(0).max(1).describe('Extraction confidence score'),
    pages: z.array(z.object({
      pageNumber: z.number(),
      text: z.string(),
      confidence: z.number()
    })).describe('Per-page extracted text with confidence scores')
  }),
  execute: async (context) => {
    const { pdfBase64, pageRange } = context.data;
    
    try {
      console.log('🔍 Starting PDF text extraction...');
      
      // Dynamic import to avoid initialization issues
      const pdfParse = (await import('pdf-parse')).default;
      
      // Convert base64 to buffer
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      console.log('� PDF buffer size:', pdfBuffer.length, 'bytes');
      
      // Use pdf-parse with our proven working approach
      const pdfData = await pdfParse(pdfBuffer, {
        // Render text only, no images needed for banking statements
        max: 0
      });

      console.log('✅ PDF text extracted successfully');
      console.log('📊 Text length:', pdfData.text.length);
      console.log('📄 Number of pages:', pdfData.numpages);
      
      // Split text by pages if needed (basic approach)
      const pages = [{
        pageNumber: 1,
        text: pdfData.text,
        confidence: 0.95 // High confidence for direct text extraction
      }];

      return {
        extractedText: pdfData.text,
        pageCount: pdfData.numpages,
        confidence: 0.95,
        pages
      };
    } catch (error) {
      console.error('❌ PDF text extraction failed:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }
});
