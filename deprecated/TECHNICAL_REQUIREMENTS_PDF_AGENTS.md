# 🔧 Technical Requirements: PDF Transaction Parser Agents

## Development Implementation Guide - MASTRA.AI Integration

---

## 📋 **Epic Overview**

**Epic Name**: PDF Transaction Parser with AI Agents  
**Priority**: High  
**Estimated Effort**: 6-8 sprints  
**Dependencies**: MASTRA.AI framework integration  

### **User Story**
```
As Sebastian/María (Spanish Actual Budget user)
I want to upload my Santander PDF bank statements
So that I can automatically import transactions without manual data entry
```

**Acceptance Criteria**:
- [ ] I can upload a PDF bank statement from Santander España
- [ ] The system extracts transactions with >99% accuracy
- [ ] Transactions are automatically categorized with >95% accuracy
- [ ] I can review and edit AI-generated categorizations before import
- [ ] The entire process takes <600 seconds for a typical monthly statement

---

## 🏗️ **Architecture Implementation**

### **Project Structure**
```
src/
├── mastra/
│   ├── agents/
│   │   ├── pdf-parser-agent.ts
│   │   └── transaction-curator-agent.ts
│   ├── tools/
│   │   ├── pdf-ocr-tool.ts
│   │   ├── transaction-extraction-tool.ts
│   │   ├── payee-matching-tool.ts
│   │   ├── category-classification-tool.ts
│   │   └── actual-integration-tool.ts
│   ├── workflows/
│   │   └── pdf-to-transactions-workflow.ts
│   └── index.ts
├── components/
│   ├── PDFUpload.tsx
│   ├── TransactionReview.tsx
│   └── ProcessingStatus.tsx
└── api/
    ├── upload-pdf.ts
    ├── process-transactions.ts
    └── approve-transactions.ts
```

---

## 🤖 **Agent Implementation Details**

### **Agent 1: PDF Parser Agent**

#### **File: `src/mastra/agents/pdf-parser-agent.ts`**
```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { 
  pdfOcrTool, 
  transactionExtractionTool, 
  bankTemplateMatchingTool 
} from '../tools';

export const pdfParserAgent = new Agent({
  name: 'PDF Transaction Parser',
  instructions: `
    You are an expert PDF transaction parser specialized in Spanish banking documents.
    
    PRIMARY OBJECTIVES:
    - Extract transaction data from Spanish bank PDFs with maximum accuracy
    - Handle various PDF layouts and formats from major Spanish banks
    - Generate clean, structured transaction data
    
    SUPPORTED BANKS:
    - Santander España (primary focus)
    
    PROCESSING WORKFLOW:
    1. Analyze PDF structure and identify bank type
    2. Apply appropriate template matching for known formats
    3. Perform OCR extraction for transaction blocks
    4. Validate extracted data completeness and format
    5. Generate structured CSV output with required fields
    
    OUTPUT REQUIREMENTS:
    - Date (DD/MM/YYYY format)
    - Payee (counterparty of transaction - the person/entity being payed or paying)
    - Description (clean, standardized)
    - Amount (decimal format, negative for debits)
    - Transaction Type (if identifiable)
    
    ERROR HANDLING:
    - Flag ambiguous or low-confidence extractions
    - Provide confidence scores for each transaction
    - Suggest manual review when accuracy is questionable
  `,
  model: openai('gpt-4o'),
  tools: {
    pdfOcrTool,
    transactionExtractionTool,
    bankTemplateMatchingTool
  },
  memory: new Memory({
    store: new LibSQLStore({
      url: 'file:pdf_parsing_memory.db'
    })
  })
});
```

#### **File: `src/mastra/tools/pdf-ocr-tool.ts`**
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

export const pdfOcrTool = createTool({
  id: 'pdf-ocr',
  description: 'Extract text from PDF using OCR and PDF parsing',
  inputSchema: z.object({
    pdfBuffer: z.instanceof(Buffer).describe('PDF file buffer'),
    pageRange: z.object({
      start: z.number().optional(),
      end: z.number().optional()
    }).optional().describe('Page range to process')
  }),
  outputSchema: z.object({
    extractedText: z.string(),
    pageCount: z.number(),
    confidence: z.number().min(0).max(1),
    pages: z.array(z.object({
      pageNumber: z.number(),
      text: z.string(),
      confidence: z.number()
    }))
  }),
  execute: async ({ pdfBuffer, pageRange = {} }) => {
    try {
      // First attempt: PDF text extraction
      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
      const pdf = await loadingTask.promise;
      const pageCount = pdf.numPages;
      
      const startPage = pageRange.start || 1;
      const endPage = Math.min(pageRange.end || pageCount, pageCount);
      
      let extractedText = '';
      let totalConfidence = 0;
      const pages = [];
      
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        let pageText = '';
        textContent.items.forEach((item: any) => {
          if ('str' in item) {
            pageText += item.str + ' ';
          }
        });
        
        // If PDF extraction yields poor results, fallback to OCR
        let confidence = 1.0;
        if (pageText.trim().length < 50) {
          // Render page as image for OCR
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;
          
          // Perform OCR
          const ocrResult = await Tesseract.recognize(canvas, 'spa');
          pageText = ocrResult.data.text;
          confidence = ocrResult.data.confidence / 100;
        }
        
        pages.push({
          pageNumber: pageNum,
          text: pageText.trim(),
          confidence
        });
        
        extractedText += pageText + '\n';
        totalConfidence += confidence;
      }
      
      return {
        extractedText: extractedText.trim(),
        pageCount: endPage - startPage + 1,
        confidence: totalConfidence / (endPage - startPage + 1),
        pages
      };
    } catch (error) {
      throw new Error(`PDF OCR processing failed: ${error.message}`);
    }
  }
});
```

#### **File: `src/mastra/tools/transaction-extraction-tool.ts`**
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const transactionExtractionTool = createTool({
  id: 'transaction-extraction',
  description: 'Extract structured transaction data from PDF text',
  inputSchema: z.object({
    extractedText: z.string().describe('Raw text extracted from PDF'),
    bankType: z.enum(['santander', 'bbva', 'caixabank', 'sabadell', 'unknown']),
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
      amount: z.number().describe('Transaction amount (negative for debits)'),
      balance: z.number().optional().describe('Account balance after transaction'),
      type: z.string().optional().describe('Transaction type'),
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
      totalCredits: z.number()
    })
  }),
  execute: async ({ extractedText, bankType, accountInfo = {} }) => {
    // Spanish bank transaction patterns
    const patterns = {
      santander: {
        datePattern: /(\d{2}\/\d{2}\/\d{4})/g,
        amountPattern: /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/g,
        descriptionPattern: /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/g,
        balancePattern: /SALDO\s*FINAL?\s*[:\s]*(-?\d{1,3}(?:\.\d{3})*,\d{2})/gi
      },
      bbva: {
        datePattern: /(\d{2}-\d{2}-\d{4})/g,
        amountPattern: /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/g,
        descriptionPattern: /(\d{2}-\d{2}-\d{4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/g
      }
    };
    
    const pattern = patterns[bankType] || patterns.santander;
    const transactions = [];
    
    // Extract transactions using regex patterns
    const matches = extractedText.matchAll(pattern.descriptionPattern);
    
    for (const match of matches) {
      const [, dateStr, description, amountStr] = match;
      
      // Parse Spanish date format
      const date = dateStr.replace(/-/g, '/');
      
      // Parse Spanish number format (1.234,56 -> 1234.56)
      const amount = parseFloat(
        amountStr.replace(/\./g, '').replace(',', '.')
      );
      
      // Clean description
      const cleanDescription = description
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s\-\(\)]/g, '');
      
      transactions.push({
        date,
        description: cleanDescription,
        amount,
        confidence: 0.9 // Base confidence, can be improved with ML
      });
    }
    
    // Calculate summary
    const amounts = transactions.map(t => t.amount);
    const dates = transactions.map(t => t.date).sort();
    
    const summary = {
      totalTransactions: transactions.length,
      dateRange: {
        from: dates[0] || '',
        to: dates[dates.length - 1] || ''
      },
      totalDebits: amounts.filter(a => a < 0).reduce((sum, a) => sum + a, 0),
      totalCredits: amounts.filter(a => a > 0).reduce((sum, a) => sum + a, 0)
    };
    
    return { transactions, summary };
  }
});
```

### **Agent 2: Transaction Curator Agent**

#### **File: `src/mastra/agents/transaction-curator-agent.ts`**
```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { 
  payeeMatchingTool, 
  categoryClassificationTool, 
  duplicateDetectionTool,
  actualIntegrationTool 
} from '../tools';

export const transactionCuratorAgent = new Agent({
  name: 'Transaction Curator & Categorizer',
  instructions: `
    You are an expert financial transaction curator specialized in Spanish banking and spending patterns.
    
    PRIMARY RESPONSIBILITIES:
    - Clean and standardize transaction descriptions
    - Identify and match payees (merchants, services, institutions)
    - Classify transactions into appropriate spending categories
    - Detect and resolve duplicate transactions
    - Prepare data for seamless Actual Budget integration
    
    SPANISH FINANCIAL CONTEXT:
    - Understand Spanish merchant naming conventions
    - Recognize common Spanish service providers (Telefónica, Endesa, etc.)
    - Handle Spanish transaction types (Transferencia, Recibo, Domiciliación, etc.)
    - Apply appropriate Spanish spending categories
    
    CATEGORIZATION GUIDELINES:
    - Alimentación: Supermarkets, restaurants, food delivery
    - Transporte: Gas stations, public transport, parking, car services
    - Hogar: Utilities, rent, home maintenance, furniture
    - Salud: Pharmacies, medical services, insurance
    - Ocio: Entertainment, subscriptions, hobbies, travel
    - Educación: Schools, courses, books, educational materials
    - Ropa: Clothing stores, shoes, accessories
    - Tecnología: Electronics, software, mobile services
    - Finanzas: Banking fees, insurance, investments
    - Otros: Uncategorizable or miscellaneous expenses
    
    PAYEE STANDARDIZATION:
    - Normalize merchant names (e.g., "MERCADONA 1234" -> "Mercadona")
    - Handle partial merchant names and codes
    - Recognize government agencies and institutions
    - Standardize service provider names
    
    QUALITY ASSURANCE:
    - Flag transactions requiring manual review
    - Provide confidence scores for categorizations
    - Detect unusual patterns or amounts
    - Maintain data consistency and accuracy
  `,
  model: openai('gpt-4o'),
  tools: {
    payeeMatchingTool,
    categoryClassificationTool,
    duplicateDetectionTool,
    actualIntegrationTool
  },
  memory: new Memory({
    store: new LibSQLStore({
      url: 'file:curation_memory.db'
    })
  })
});
```

#### **File: `src/mastra/tools/category-classification-tool.ts`**
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const categoryClassificationTool = createTool({
  id: 'category-classification',
  description: 'Classify transactions into Spanish spending categories',
  inputSchema: z.object({
    transactions: z.array(z.object({
      description: z.string(),
      amount: z.number(),
      payee: z.string().optional(),
      date: z.string()
    }))
  }),
  outputSchema: z.object({
    categorizedTransactions: z.array(z.object({
      description: z.string(),
      amount: z.number(),
      payee: z.string(),
      date: z.string(),
      category: z.string(),
      subcategory: z.string().optional(),
      confidence: z.number().min(0).max(1),
      reasoning: z.string().optional()
    }))
  }),
  execute: async ({ transactions }) => {
    // Spanish category classification rules
    const categoryRules = [
      // Alimentación
      {
        keywords: ['mercadona', 'carrefour', 'dia', 'lidl', 'aldi', 'supermercado', 'restaurante', 'bar', 'cafeteria', 'mcdonalds', 'burger', 'pizza', 'kebab', 'glovo', 'deliveroo', 'uber eats'],
        category: 'Alimentación',
        confidence: 0.95
      },
      // Transporte
      {
        keywords: ['gasolinera', 'repsol', 'cepsa', 'bp', 'shell', 'emt', 'metro', 'renfe', 'parking', 'uber', 'cabify', 'blablacar','bolt', 'peaje'],
        category: 'Transporte',
        confidence: 0.9
      },
      // Hogar
      {
        keywords: ['ikea', 'leroy merlin', 'bricomart', 'endesa', 'iberdrola', 'naturgy', 'aqualia', 'agua', 'luz', 'gas', 'alquiler', 'hipoteca'],
        category: 'Hogar',
        confidence: 0.9
      },
      // Tecnología
      {
        keywords: ['telefonica', 'orange', 'vodafone', 'movistar', 'yoigo', 'mediamarkt', 'fnac', 'pccomponentes', 'amazon', 'apple', 'google'],
        category: 'Tecnología',
        confidence: 0.85
      },
      // Salud
      {
        keywords: ['farmacia', 'hospital', 'medico', 'clinica', 'dentista', 'seguro medico', 'sanitas', 'adeslas'],
        category: 'Salud',
        confidence: 0.9
      },
      // Ocio
      {
        keywords: ['cine', 'netflix', 'spotify', 'teatro', 'concierto', 'gym', 'gimnasio', 'hotel', 'booking', 'viaje'],
        category: 'Ocio',
        confidence: 0.85
      }
    ];
    
    const categorizedTransactions = transactions.map(transaction => {
      let bestMatch = { category: 'Otros', confidence: 0.3, reasoning: 'No specific category match found' };
      
      const description = transaction.description.toLowerCase();
      const payee = (transaction.payee || '').toLowerCase();
      const searchText = `${description} ${payee}`;
      
      // Find best matching category
      for (const rule of categoryRules) {
        const matches = rule.keywords.filter(keyword => 
          searchText.includes(keyword)
        );
        
        if (matches.length > 0) {
          const confidence = rule.confidence * (matches.length / rule.keywords.length);
          if (confidence > bestMatch.confidence) {
            bestMatch = {
              category: rule.category,
              confidence,
              reasoning: `Matched keywords: ${matches.join(', ')}`
            };
          }
        }
      }
      
      // Special handling for transfers and banking operations
      if (description.includes('transferencia') || description.includes('ingreso')) {
        if (transaction.amount > 0) {
          bestMatch = { category: 'Ingresos', confidence: 0.95, reasoning: 'Detected income transaction' };
        } else {
          bestMatch = { category: 'Transferencias', confidence: 0.95, reasoning: 'Detected transfer transaction' };
        }
      }
      
      return {
        ...transaction,
        payee: transaction.payee || extractPayeeFromDescription(transaction.description),
        category: bestMatch.category,
        confidence: bestMatch.confidence,
        reasoning: bestMatch.reasoning
      };
    });
    
    return { categorizedTransactions };
  }
});

function extractPayeeFromDescription(description: string): string {
  // Extract payee from transaction description
  const cleanDescription = description
    .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '') // Remove dates
    .replace(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g, '') // Remove amounts
    .replace(/[^\w\s]/g, ' ') // Remove special chars
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
    
  // Take the first meaningful part as payee
  const words = cleanDescription.split(' ').filter(word => word.length > 2);
  return words.slice(0, 3).join(' ') || cleanDescription;
}
```

---

## 🌊 **Workflow Implementation**

#### **File: `src/mastra/workflows/pdf-to-transactions-workflow.ts`**
```typescript
import { Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { pdfParserAgent } from '../agents/pdf-parser-agent';
import { transactionCuratorAgent } from '../agents/transaction-curator-agent';

export const pdfToTransactionsWorkflow = new Workflow({
  name: 'pdf-to-transactions',
  triggerSchema: z.object({
    pdfBuffer: z.instanceof(Buffer),
    accountId: z.string(),
    userId: z.string(),
    bankType: z.enum(['santander', 'bbva', 'caixabank', 'sabadell', 'unknown']).default('santander')
  })
})
  .step('extract-pdf-data', {
    agent: pdfParserAgent,
    inputSchema: z.object({
      pdfBuffer: z.instanceof(Buffer),
      bankType: z.string()
    }),
    outputSchema: z.object({
      rawTransactions: z.array(z.any()),
      extractionSummary: z.object({
        totalTransactions: z.number(),
        confidence: z.number()
      })
    })
  })
  .step('curate-transactions', {
    agent: transactionCuratorAgent,
    inputSchema: z.object({
      rawTransactions: z.array(z.any()),
      accountId: z.string()
    }),
    outputSchema: z.object({
      curatedTransactions: z.array(z.any()),
      curationSummary: z.object({
        categorized: z.number(),
        needsReview: z.number()
      })
    })
  })
  .step('prepare-for-import', {
    inputSchema: z.object({
      curatedTransactions: z.array(z.any()),
      accountId: z.string()
    }),
    outputSchema: z.object({
      importReadyTransactions: z.array(z.any()),
      csvData: z.string()
    })
  });
```

---

## 🎨 **Frontend Implementation**

#### **File: `src/components/PDFUpload.tsx`**
```tsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@actual-app/web/src/components/common/Button';
import { View } from '@actual-app/web/src/components/common/View';
import { Text } from '@actual-app/web/src/components/common/Text';

interface PDFUploadProps {
  accountId: string;
  onUploadSuccess: (jobId: string) => void;
  onError: (error: string) => void;
}

export const PDFUpload: React.FC<PDFUploadProps> = ({
  accountId,
  onUploadSuccess,
  onError
}) => {
  const [isUploading, setIsUploading] = useState(false);
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || file.type !== 'application/pdf') {
      onError('Por favor selecciona un archivo PDF válido');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      onError('El archivo es demasiado grande. Máximo 10MB.');
      return;
    }
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('accountId', accountId);
      
      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Error al subir el archivo');
      }
      
      const { jobId } = await response.json();
      onUploadSuccess(jobId);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setIsUploading(false);
    }
  }, [accountId, onUploadSuccess, onError]);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    disabled: isUploading
  });
  
  return (
    <View
      {...getRootProps()}
      style={{
        border: '2px dashed #d1d5db',
        borderRadius: '8px',
        padding: '2rem',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: isDragActive ? '#f3f4f6' : '#ffffff',
        transition: 'background-color 0.2s ease'
      }}
    >
      <input {...getInputProps()} />
      
      {isUploading ? (
        <View>
          <Text style={{ fontSize: '1.125rem', color: '#6b7280' }}>
            🤖 Procesando PDF con IA...
          </Text>
          <Text style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>
            Esto puede tomar unos segundos
          </Text>
        </View>
      ) : (
        <View>
          <Text style={{ fontSize: '1.125rem', color: '#374151', marginBottom: '0.5rem' }}>
            📄 Arrastra tu extracto PDF aquí
          </Text>
          <Text style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
            o haz clic para seleccionar archivo
          </Text>
          <Text style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            Soporta: Santander España, BBVA, CaixaBank
          </Text>
          <Button
            type="button"
            style={{
              marginTop: '1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem'
            }}
          >
            Seleccionar PDF
          </Button>
        </View>
      )}
    </View>
  );
};
```

#### **File: `src/components/TransactionReview.tsx`**
```tsx
import React, { useState } from 'react';
import { Button } from '@actual-app/web/src/components/common/Button';
import { View } from '@actual-app/web/src/components/common/View';
import { Text } from '@actual-app/web/src/components/common/Text';
import { Table, Row, Cell } from '@actual-app/web/src/components/table';

interface Transaction {
  id: string;
  date: string;
  description: string;
  payee: string;
  amount: number;
  category: string;
  confidence: number;
  needsReview?: boolean;
}

interface TransactionReviewProps {
  transactions: Transaction[];
  onApprove: (transactions: Transaction[]) => void;
  onEdit: (transactionId: string, updates: Partial<Transaction>) => void;
}

export const TransactionReview: React.FC<TransactionReviewProps> = ({
  transactions,
  onApprove,
  onEdit
}) => {
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(
    new Set(transactions.map(t => t.id))
  );
  
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  
  const toggleTransaction = (id: string) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTransactions(newSelected);
  };
  
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return '#10b981'; // green
    if (confidence >= 0.6) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  };
  
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };
  
  const handleApprove = () => {
    const selectedTransactionsList = transactions.filter(t => 
      selectedTransactions.has(t.id)
    );
    onApprove(selectedTransactionsList);
  };
  
  return (
    <View style={{ padding: '1rem' }}>
      <View style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <Text style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
          Revisar Transacciones Extraídas
        </Text>
        <View style={{ display: 'flex', gap: '0.5rem' }}>
          <Button
            onClick={() => setSelectedTransactions(new Set(transactions.map(t => t.id)))}
            style={{ fontSize: '0.875rem' }}
          >
            Seleccionar Todas
          </Button>
          <Button
            onClick={() => setSelectedTransactions(new Set())}
            style={{ fontSize: '0.875rem' }}
          >
            Deseleccionar Todas
          </Button>
        </View>
      </View>
      
      <View style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
        <Text style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          📊 {transactions.length} transacciones encontradas | 
          {transactions.filter(t => t.confidence >= 0.8).length} alta confianza | 
          {transactions.filter(t => t.needsReview).length} requieren revisión
        </Text>
      </View>
      
      <Table>
        <Row style={{ backgroundColor: '#f3f4f6', fontWeight: 'bold' }}>
          <Cell width="50px">
            <input
              type="checkbox"
              checked={selectedTransactions.size === transactions.length}
              onChange={() => {
                if (selectedTransactions.size === transactions.length) {
                  setSelectedTransactions(new Set());
                } else {
                  setSelectedTransactions(new Set(transactions.map(t => t.id)));
                }
              }}
            />
          </Cell>
          <Cell>Fecha</Cell>
          <Cell>Descripción</Cell>
          <Cell>Beneficiario</Cell>
          <Cell>Categoría</Cell>
          <Cell>Importe</Cell>
          <Cell>Confianza</Cell>
          <Cell>Acciones</Cell>
        </Row>
        
        {transactions.map((transaction) => (
          <Row
            key={transaction.id}
            style={{
              backgroundColor: transaction.needsReview ? '#fef3c7' : 'white',
              borderLeft: transaction.needsReview ? '4px solid #f59e0b' : 'none'
            }}
          >
            <Cell>
              <input
                type="checkbox"
                checked={selectedTransactions.has(transaction.id)}
                onChange={() => toggleTransaction(transaction.id)}
              />
            </Cell>
            
            <Cell>{transaction.date}</Cell>
            
            <Cell>
              <Text style={{ fontSize: '0.875rem' }}>
                {transaction.description}
              </Text>
            </Cell>
            
            <Cell>
              {editingTransaction === transaction.id ? (
                <input
                  type="text"
                  defaultValue={transaction.payee}
                  onBlur={(e) => {
                    onEdit(transaction.id, { payee: e.target.value });
                    setEditingTransaction(null);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      onEdit(transaction.id, { payee: e.currentTarget.value });
                      setEditingTransaction(null);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <Text 
                  style={{ cursor: 'pointer' }}
                  onClick={() => setEditingTransaction(transaction.id)}
                >
                  {transaction.payee}
                </Text>
              )}
            </Cell>
            
            <Cell>
              <select
                value={transaction.category}
                onChange={(e) => onEdit(transaction.id, { category: e.target.value })}
                style={{ fontSize: '0.875rem', padding: '0.25rem' }}
              >
                <option value="Alimentación">Alimentación</option>
                <option value="Transporte">Transporte</option>
                <option value="Hogar">Hogar</option>
                <option value="Salud">Salud</option>
                <option value="Ocio">Ocio</option>
                <option value="Educación">Educación</option>
                <option value="Ropa">Ropa</option>
                <option value="Tecnología">Tecnología</option>
                <option value="Finanzas">Finanzas</option>
                <option value="Otros">Otros</option>
              </select>
            </Cell>
            
            <Cell>
              <Text style={{ 
                fontWeight: 'bold',
                color: transaction.amount < 0 ? '#ef4444' : '#10b981'
              }}>
                {formatAmount(transaction.amount)}
              </Text>
            </Cell>
            
            <Cell>
              <View style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getConfidenceColor(transaction.confidence)
                  }}
                />
                <Text style={{ fontSize: '0.75rem' }}>
                  {Math.round(transaction.confidence * 100)}%
                </Text>
              </View>
            </Cell>
            
            <Cell>
              <Button
                onClick={() => setEditingTransaction(
                  editingTransaction === transaction.id ? null : transaction.id
                )}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                Editar
              </Button>
            </Cell>
          </Row>
        ))}
      </Table>
      
      <View style={{ 
        marginTop: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Text style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {selectedTransactions.size} de {transactions.length} transacciones seleccionadas
        </Text>
        
        <Button
          onClick={handleApprove}
          disabled={selectedTransactions.size === 0}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 'bold'
          }}
        >
          Importar {selectedTransactions.size} Transacciones
        </Button>
      </View>
    </View>
  );
};
```

---

## 🔌 **API Implementation**

#### **File: `src/api/upload-pdf.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { pdfToTransactionsWorkflow } from '../mastra/workflows/pdf-to-transactions-workflow';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get('pdf') as File;
    const accountId = formData.get('accountId') as string;
    
    if (!pdfFile || !accountId) {
      return NextResponse.json(
        { error: 'PDF file and account ID are required' },
        { status: 400 }
      );
    }
    
    // Validate PDF file
    if (pdfFile.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }
    
    if (pdfFile.size > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }
    
    // Convert to buffer
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    
    // Generate job ID
    const jobId = uuidv4();
    
    // Start workflow asynchronously
    pdfToTransactionsWorkflow.trigger({
      pdfBuffer,
      accountId,
      userId: 'user-123', // Get from session
      bankType: 'santander' // Auto-detect or let user select
    }, { jobId });
    
    return NextResponse.json({ 
      jobId,
      status: 'processing',
      message: 'PDF uploaded successfully. Processing with AI agents...'
    });
    
  } catch (error) {
    console.error('PDF upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## 🧪 **Testing Requirements**

### **Unit Tests**
```typescript
// tests/agents/pdf-parser-agent.test.ts
import { pdfParserAgent } from '../src/mastra/agents/pdf-parser-agent';

describe('PDF Parser Agent', () => {
  it('should extract transactions from Santander PDF', async () => {
    const testPdf = await loadTestPDF('santander-sample.pdf');
    const result = await pdfParserAgent.run({
      message: 'Extract transactions from this PDF',
      context: { pdfBuffer: testPdf }
    });
    
    expect(result.transactions).toHaveLength(25);
    expect(result.summary.confidence).toBeGreaterThan(0.9);
  });
});

// tests/tools/category-classification-tool.test.ts
import { categoryClassificationTool } from '../src/mastra/tools/category-classification-tool';

describe('Category Classification Tool', () => {
  it('should correctly categorize Spanish transactions', async () => {
    const testTransactions = [
      { description: 'MERCADONA 1234', amount: -45.67, payee: 'Mercadona' },
      { description: 'REPSOL GASOLINERA', amount: -60.00, payee: 'Repsol' }
    ];
    
    const result = await categoryClassificationTool.execute({ transactions: testTransactions });
    
    expect(result.categorizedTransactions[0].category).toBe('Alimentación');
    expect(result.categorizedTransactions[1].category).toBe('Transporte');
  });
});
```

### **Integration Tests**
```typescript
// tests/integration/pdf-workflow.test.ts
describe('PDF to Transactions Workflow', () => {
  it('should process complete PDF-to-import flow', async () => {
    // Load test PDF
    const pdfBuffer = await loadTestPDF('santander-complete-statement.pdf');
    
    // Execute workflow
    const result = await pdfToTransactionsWorkflow.execute({
      pdfBuffer,
      accountId: 'test-account-123',
      userId: 'test-user-456'
    });
    
    // Verify results
    expect(result.importReadyTransactions).toBeDefined();
    expect(result.csvData).toContain('Date,Description,Amount,Category');
    expect(result.importReadyTransactions.length).toBeGreaterThan(0);
  });
});
```

---

## 📋 **Definition of Done**

### **Feature Acceptance Criteria**
- [ ] User can upload PDF bank statements (Santander España)
- [ ] AI extracts transactions with >99% accuracy
- [ ] AI categorizes transactions with >95% accuracy
- [ ] User can review and edit AI suggestions
- [ ] Transactions integrate seamlessly with Actual Budget
- [ ] Process completes in <600 seconds for typical monthly statements
- [ ] Error handling covers edge cases and malformed PDFs
- [ ] Security measures prevent malicious file uploads

### **Technical Acceptance Criteria**
- [ ] MASTRA.AI agents properly configured and tested
- [ ] All tools have comprehensive unit tests (>90% coverage)
- [ ] Integration tests cover end-to-end workflow
- [ ] Performance benchmarks meet requirements
- [ ] Security audit passed
- [ ] Documentation complete and up-to-date
- [ ] Code review approved by senior developers

### **Quality Gates**
- [ ] **Performance**: PDF processing <120 seconds average
- [ ] **Accuracy**: Transaction extraction >99%, categorization >95%
- [ ] **Reliability**: <1% processing failures
- [ ] **Usability**: >85% user satisfaction in testing
- [ ] **Maintainability**: Code quality metrics above threshold

---

*Document Version: 1.0*  
*Last Updated: September 25, 2025*  
*Owner: Development Team*  
*Reviewers: Tech Lead, Product Manager, QA Lead*
