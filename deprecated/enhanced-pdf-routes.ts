import express, { Request, Response } from 'express';
import multer from 'multer';
import { pdfOcrTool } from '../tools/pdf-ocr-tool';
import { enhancedTransactionExtractionTool } from '../tools/enhanced-transaction-extraction-tool';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Enhanced PDF parsing endpoint with improved Spanish bank support
router.post('/parse-pdf-enhanced', upload.single('pdf'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ 
        error: 'No PDF file uploaded' 
      });
      return;
    }

    const { bankType = 'santander' } = req.body;

    console.log(`Processing ${req.file.originalname} (${req.file.size} bytes) for ${bankType}`);

    // Step 1: Extract text from PDF using OCR tool
    const ocrResult = await pdfOcrTool.execute({
      data: {
        pdfBuffer: req.file.buffer,
        language: 'spa'
      }
    });

    if (!ocrResult.extractedText) {
      res.status(500).json({
        error: 'Failed to extract text from PDF',
        details: 'OCR processing failed'
      });
      return;
    }

    console.log(`Extracted ${ocrResult.extractedText.length} characters from PDF`);

    // Step 2: Extract transactions using enhanced tool
    const extractionResult = await enhancedTransactionExtractionTool.execute({
      data: {
        extractedText: ocrResult.extractedText,
        bankType: bankType as any,
        accountInfo: {
          currency: 'EUR'
        }
      }
    });

    // Step 3: Return structured response
    const response = {
      success: true,
      metadata: {
        filename: req.file.originalname,
        fileSize: req.file.size,
        bankType,
        processingTime: Date.now() - (req as any).startTime,
        extractedTextLength: ocrResult.extractedText.length
      },
      data: {
        transactions: extractionResult.transactions,
        summary: extractionResult.summary,
        rawText: req.query.includeRawText === 'true' ? ocrResult.extractedText : undefined
      }
    };

    console.log(`Successfully extracted ${extractionResult.transactions.length} transactions`);
    
    res.json(response);

  } catch (error) {
    console.error('PDF parsing error:', error);
    res.status(500).json({
      error: 'Internal server error during PDF processing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint with sample Santander data
router.post('/test-extraction', async (req: Request, res: Response): Promise<void> => {
  try {
    // Sample real Santander PDF text for testing
    const sampleText = `TITULAR: ROPERO SEBASTIAN
CUENTA SEBASTIAN: ES2400497175032810076563
Saldo: 3.847,32 EUR (a fecha 25/09/2025) Retenciones : 17,99 EUR
Movimientos de cuenta del 1 Septiembre 2025 al 25 Septiembre 2025
Fecha operación Operación Importe Saldo
25/09/2025 Pago Movil En Saint Georges, Madrid, Tarj. :*536242 -6,00 EUR 3.847,32 EUR
24/09/2025 Impuesto: 2025 Tasas Del Tesoro. -28,87 EUR 3.853,32 EUR
24/09/2025 Traspaso: -50,00 EUR 3.882,19 EUR
17/09/2025 Recepcion De Nota De Abono 82,67 EUR 4.287,89 EUR
15/09/2025 Compra Openai, Openai.com, Tarjeta 4176570102536242 , -4,43 EUR 4.415,45 EUR
08/09/2025 Transferencia Inmediata A Favor De Sebastian Ropero -28,39 EUR 4.900,00 EUR
01/09/2025 Transferencia Inmediata De Healy Maria Del Rosario, 320,00 EUR 5.225,73 EUR
02/09/2025 Transaccion Contactless En Saint Georges C, Madrid, Tarj. : -3,00 EUR 5.220,83 EUR`;

    console.log('Testing extraction with sample Santander data...');

    const extractionResult = await enhancedTransactionExtractionTool.execute({
      data: {
        extractedText: sampleText,
        bankType: 'santander',
        accountInfo: {
          currency: 'EUR'
        }
      }
    });

    const response = {
      success: true,
      metadata: {
        testData: 'sample_santander_pdf',
        bankType: 'santander',
        extractedTextLength: sampleText.length
      },
      data: {
        transactions: extractionResult.transactions,
        summary: extractionResult.summary
      }
    };

    console.log(`Test completed: ${extractionResult.transactions.length} transactions extracted`);
    
    res.json(response);

  } catch (error) {
    console.error('Test extraction error:', error);
    res.status(500).json({
      error: 'Internal server error during test extraction',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint
router.get('/health', (req: Request, res: Response): void => {
  res.json({ 
    status: 'healthy',
    service: 'enhanced-pdf-parser',
    timestamp: new Date().toISOString(),
    features: [
      'Spanish bank PDF parsing',
      'Santander format optimization',
      'Enhanced transaction categorization',
      'Real-world pattern matching'
    ]
  });
});

export default router;
