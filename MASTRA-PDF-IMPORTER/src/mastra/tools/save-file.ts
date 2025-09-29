import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export const saveFileTool = createTool({
  id: 'save-file',
  description: 'Save a base64 encoded file to disk for processing',
  inputSchema: z.object({
    base64Data: z.string().describe('Base64 encoded file data (with or without data URL prefix)'),
    filename: z.string().optional().describe('Original filename (optional)'),
    mimeType: z.string().optional().describe('MIME type of the file'),
  }),
  outputSchema: z.object({
    filePath: z.string().describe('Path where the file was saved'),
    success: z.boolean().describe('Whether the file was saved successfully'),
    error: z.string().optional().describe('Error message if saving failed'),
  }),
  execute: async ({ context }) => {
    const { base64Data, filename, mimeType } = context;
    
    try {
      // Clean base64 data (remove data URL prefix if present)
      let cleanBase64 = base64Data;
      if (base64Data.includes(',')) {
        cleanBase64 = base64Data.split(',')[1];
      }
      
      // Generate filename if not provided
      let finalFilename = filename || `file_${randomUUID()}`;
      
      // Add extension based on MIME type if not present
      if (mimeType === 'application/pdf' && !finalFilename.toLowerCase().endsWith('.pdf')) {
        finalFilename += '.pdf';
      }
      
      // Create temporary directory if it doesn't exist
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Generate full file path
      const filePath = path.join(tempDir, finalFilename);
      
      // Convert base64 to buffer and write to file
      const buffer = Buffer.from(cleanBase64, 'base64');
      fs.writeFileSync(filePath, buffer);
      
      return {
        filePath,
        success: true
      };
      
    } catch (error) {
      return {
        filePath: '',
        success: false,
        error: `Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});
