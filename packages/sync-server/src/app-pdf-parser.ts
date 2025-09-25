import express from 'express';
import multer from 'multer';
import { mastra } from '../../../src/mastra';

const app = express();

// Configure multer for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// PDF upload and processing endpoint
app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    // Convert buffer to base64 for the agent
    const pdfBase64 = req.file.buffer.toString('base64');
    
    console.log('Processing PDF with MASTRA agent...');
    
    // Use the PDF parser agent
    const result = await mastra.agents.pdfParserAgent.run({
      message: `Extract transactions from this Spanish bank PDF. The PDF is provided in base64 format. Please use the pdf-ocr tool first to extract text, then use the transaction-extraction tool to parse the transactions.`,
      context: {
        pdfBase64,
        accountId,
        bankType: 'santander' // Default to Santander, could be auto-detected later
      }
    });

    console.log('Agent processing completed');

    res.json({
      success: true,
      message: 'PDF processed successfully',
      data: {
        agentResponse: result.text,
        // The actual extracted data would be in the tool results
        // We'll need to parse this from the agent's response
      }
    });

  } catch (error) {
    console.error('PDF processing error:', error);
    res.status(500).json({ 
      error: 'PDF processing failed',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-parser' });
});

export { app as pdfParserApp };
