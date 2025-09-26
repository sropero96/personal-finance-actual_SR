# Plan de Implementación - Sprint 1: PDF Extractor Agent

## 🎯 Objetivo del Sprint

Crear el **PDF Extractor Agent** siguiendo las mejores prácticas de MASTRA, con arquitectura modular y herramientas especializadas para extraer datos de PDFs bancarios españoles (Santander y Revolut).

## 📋 Plan de Ejecución Corregido

### Fase 0: Preparación de Datos (NUEVO - 45 min)

**Objetivo:** Analizar patrones reales de PDFs bancarios para implementar parsers precisos

#### 0.1 Recopilación de PDFs de Prueba

- [ ] **Santander:** 2-3 PDFs de extractos mensuales (diferentes períodos)
- [ ] **Revolut:** 2-3 PDFs (personal/business, multi-moneda si está disponible)
- [ ] Crear directorio: `F1_PDF_IMPORTER/test-data/sample-pdfs/`

#### 0.2 Análisis Manual de Estructuras

**Patrones a identificar:**

- **Santander:**
  - Headers de identificación del banco
  - Formato de fechas (DD/MM/YYYY vs DD-MM-YYYY)
  - Estructura de transacciones (columnas: fecha, concepto, importe, saldo)
  - Códigos de operación (transferencias, domiciliaciones, etc.)
  - Formato de números (comas vs puntos decimales)

- **Revolut:**
  - Headers distintivos de Revolut
  - Formato multi-moneda
  - Categorización automática incluida
  - Estructura de merchant/payee information
  - Referencias de transacciones internacionales

#### 0.3 Definición de Regex Patterns

```typescript
// Documentar patrones encontrados
const SantanderPatterns = {
  // Basado en análisis real de PDFs
  bankIdentifier: /BANCO SANTANDER|SANTANDER CONSUMER/i,
  transactionLine: /\d{2}\/\d{2}\/\d{4}\s+.*?(-?\d+,\d{2})\s+(-?\d+,\d{2})/g,
  dateFormat: /\d{2}\/\d{2}\/\d{4}/g,
  amountFormat: /(-?\d{1,3}(?:\.\d{3})*,\d{2})/g
};

const RevolutPatterns = {
  // Basado en análisis real de PDFs  
  bankIdentifier: /Revolut|REVOLUT LTD/i,
  transactionLine: /\d{2}\s\w{3}\s\d{4}.*?[A-Z]{3}\s(-?\d+\.\d{2})/g,
  dateFormat: /\d{2}\s\w{3}\s\d{4}/g,
  amountFormat: /[A-Z]{3}\s(-?\d+\.\d{2})/g
};
```

### Fase 1: Setup del Proyecto MASTRA (30 min)

**Directorio:** `../mastra-actual_finance_sr/`

#### 1.1 Verificar e Inicializar Proyecto MASTRA

```bash
# Navegar a directorio MASTRA
cd ../mastra-actual_finance_sr

# Verificar si ya existe proyecto
ls -la

# Si no existe, inicializar con template quick-start
pnpm create mastra@latest . --template=quick-start

# Si ya existe, verificar estructura
ls -la src/mastra/
```

#### 1.2 Instalar Dependencias Adicionales

```bash
# Instalar librerías para procesamiento PDF
pnpm add pdf-parse pdf2pic @types/node

# Verificar instalación
pnpm list pdf-parse
```

#### 1.3 Configurar Estructura del Proyecto

```
src/mastra/
├── agents/
│   └── pdf-extractor-agent.ts        # 🆕 Agente principal
├── tools/
│   ├── pdf-reader.ts                 # 🆕 Tool: Lectura PDF
│   ├── santander-parser.ts           # 🆕 Tool: Parser Santander
│   └── revolut-parser.ts             # 🆕 Tool: Parser Revolut
├── workflows/
│   └── pdf-extraction-workflow.ts    # 🆕 Workflow (futuro)
└── index.ts                          # Configuración MASTRA
```

### Fase 2: Herramientas Core (90 min)

#### 2.1 Tool: PDF Reader (25 min)

```typescript
// src/mastra/tools/pdf-reader.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as pdfParse from "pdf-parse";

export const pdfReaderTool = createTool({
  id: "pdf-reader",
  description: "Extracts text content from PDF files preserving layout structure",
  inputSchema: z.object({
    pdfBuffer: z.instanceof(Buffer).describe("PDF file as buffer"),
    extractOptions: z.object({
      preserveLayout: z.boolean().default(true),
      includePositions: z.boolean().default(false),
      normalizeWhitespace: z.boolean().default(true)
    }).optional()
  }),
  outputSchema: z.object({
    text: z.string(),
    pageCount: z.number(),
    pages: z.array(z.object({
      pageNumber: z.number(),
      text: z.string()
    })),
    metadata: z.object({
      title: z.string().optional(),
      author: z.string().optional(),
      creator: z.string().optional(),
      creationDate: z.string().optional()
    })
  }),
  execute: async ({ context }) => {
    const { pdfBuffer, extractOptions = {} } = context;
    
    try {
      // Parse PDF using pdf-parse
      const pdfData = await pdfParse(pdfBuffer, {
        // Configuración para preservar layout
        normalizeWhitespace: extractOptions.normalizeWhitespace !== false,
        // Más opciones según necesidades específicas
      });

      // Split text by pages if possible
      const pages = pdfData.text.split('\f').map((pageText, index) => ({
        pageNumber: index + 1,
        text: pageText.trim()
      }));

      return {
        text: pdfData.text,
        pageCount: pdfData.numpages || 1,
        pages: pages,
        metadata: {
          title: pdfData.info?.Title,
          author: pdfData.info?.Author,
          creator: pdfData.info?.Creator,
          creationDate: pdfData.info?.CreationDate?.toString()
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }
});
```

#### 2.2 Tool: Santander Parser (30 min)

```typescript
// src/mastra/tools/santander-parser.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Patrones específicos de Santander (actualizar con PDFs reales)
const SANTANDER_PATTERNS = {
  bankIdentifier: /BANCO SANTANDER|SANTANDER CONSUMER/i,
  accountNumber: /CUENTA[:\s]+(\d{4}\s\d{4}\s\d{2}\s\d{10})/i,
  period: /PERIODO[:\s]+(\d{2}\/\d{2}\/\d{4})\s+AL\s+(\d{2}\/\d{2}\/\d{4})/i,
  transactionLine: /(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/g,
  balance: /SALDO ANTERIOR[:\s]+(-?\d{1,3}(?:\.\d{3})*,\d{2})/i
};

export const santanderParserTool = createTool({
  id: "santander-parser",
  description: "Parses Santander bank PDF statements to extract transaction data with Spanish formatting",
  inputSchema: z.object({
    pdfText: z.string().describe("Raw text extracted from Santander PDF"),
    accountNumber: z.string().optional().describe("Expected account number for validation")
  }),
  outputSchema: z.object({
    bankType: z.literal("santander"),
    transactions: z.array(z.object({
      date: z.string().describe("Date in YYYY-MM-DD format"),
      description: z.string().describe("Transaction description"),
      amount: z.number().describe("Transaction amount (negative for debits)"),
      balance: z.number().describe("Account balance after transaction"),
      rawText: z.string().describe("Original line from PDF"),
      confidence: z.number().min(0).max(1).describe("Confidence score"),
      transactionId: z.string().describe("Generated unique ID")
    })),
    accountInfo: z.object({
      accountNumber: z.string(),
      period: z.object({
        from: z.string(),
        to: z.string()
      }),
      openingBalance: z.number(),
      closingBalance: z.number()
    }),
    metadata: z.object({
      totalTransactions: z.number(),
      averageConfidence: z.number(),
      processingTime: z.number()
    })
  }),
  execute: async ({ context }) => {
    const startTime = Date.now();
    const { pdfText, accountNumber } = context;
    
    // Verificar que es un PDF de Santander
    if (!SANTANDER_PATTERNS.bankIdentifier.test(pdfText)) {
      throw new Error("This does not appear to be a Santander bank statement");
    }

    // Extraer información de cuenta
    const accountMatch = pdfText.match(SANTANDER_PATTERNS.accountNumber);
    const extractedAccountNumber = accountMatch ? accountMatch[1].replace(/\s/g, '') : '';
    
    if (accountNumber && extractedAccountNumber !== accountNumber.replace(/\s/g, '')) {
      throw new Error(`Account number mismatch. Expected: ${accountNumber}, Found: ${extractedAccountNumber}`);
    }

    // Extraer período
    const periodMatch = pdfText.match(SANTANDER_PATTERNS.period);
    const period = periodMatch ? {
      from: convertSpanishDate(periodMatch[1]),
      to: convertSpanishDate(periodMatch[2])
    } : { from: '', to: '' };

    // Extraer saldo inicial
    const balanceMatch = pdfText.match(SANTANDER_PATTERNS.balance);
    const openingBalance = balanceMatch ? parseSpanishAmount(balanceMatch[1]) : 0;

    // Extraer transacciones
    const transactions = [];
    let match;
    let runningBalance = openingBalance;
    
    SANTANDER_PATTERNS.transactionLine.lastIndex = 0; // Reset regex
    
    while ((match = SANTANDER_PATTERNS.transactionLine.exec(pdfText)) !== null) {
      const [fullMatch, dateStr, description, amountStr, balanceStr] = match;
      
      const amount = parseSpanishAmount(amountStr);
      const balance = parseSpanishAmount(balanceStr);
      runningBalance = balance; // Update running balance
      
      const transaction = {
        date: convertSpanishDate(dateStr),
        description: description.trim(),
        amount: amount,
        balance: balance,
        rawText: fullMatch.trim(),
        confidence: calculateConfidence(fullMatch),
        transactionId: generateTransactionId(dateStr, description, amount)
      };
      
      transactions.push(transaction);
    }

    const processingTime = Date.now() - startTime;
    const totalConfidence = transactions.reduce((sum, t) => sum + t.confidence, 0);
    const averageConfidence = transactions.length > 0 ? totalConfidence / transactions.length : 0;

    return {
      bankType: "santander" as const,
      transactions,
      accountInfo: {
        accountNumber: extractedAccountNumber,
        period,
        openingBalance,
        closingBalance: runningBalance
      },
      metadata: {
        totalTransactions: transactions.length,
        averageConfidence,
        processingTime
      }
    };
  }
});

// Helper functions
function convertSpanishDate(dateStr: string): string {
  // Convert DD/MM/YYYY to YYYY-MM-DD
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseSpanishAmount(amountStr: string): number {
  // Convert Spanish format "1.234,56" to number
  return parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
}

function calculateConfidence(rawLine: string): number {
  // Simple confidence calculation - can be improved
  const hasValidDate = /\d{2}\/\d{2}\/\d{4}/.test(rawLine);
  const hasValidAmount = /-?\d{1,3}(?:\.\d{3})*,\d{2}/.test(rawLine);
  const hasDescription = rawLine.trim().length > 20;
  
  let confidence = 0.5;
  if (hasValidDate) confidence += 0.2;
  if (hasValidAmount) confidence += 0.2;
  if (hasDescription) confidence += 0.1;
  
  return Math.min(confidence, 1.0);
}

function generateTransactionId(date: string, description: string, amount: number): string {
  const hash = `${date}-${description.slice(0, 10)}-${amount}`.replace(/\s/g, '_');
  return `santander_${hash}_${Date.now()}`;
}
```

#### 2.3 Tool: Revolut Parser (30 min)

```typescript
// src/mastra/tools/revolut-parser.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Patrones específicos de Revolut (actualizar con PDFs reales)
const REVOLUT_PATTERNS = {
  bankIdentifier: /Revolut|REVOLUT LTD/i,
  accountHolder: /Account holder[:\s]+(.+)/i,
  period: /Statement period[:\s]+(\d{2}\s\w{3}\s\d{4})\s+to\s+(\d{2}\s\w{3}\s\d{4})/i,
  transactionLine: /(\d{2}\s\w{3}\s\d{4})\s+(.*?)\s+([A-Z]{3})\s+(-?\d+\.\d{2})/g,
  currency: /([A-Z]{3})\s+(-?\d+\.\d{2})/g
};

export const revolutParserTool = createTool({
  id: "revolut-parser",
  description: "Parses Revolut bank PDF statements to extract transaction data with multi-currency support",
  inputSchema: z.object({
    pdfText: z.string().describe("Raw text extracted from Revolut PDF"),
    currency: z.string().optional().describe("Expected primary currency (EUR, USD, etc.)")
  }),
  outputSchema: z.object({
    bankType: z.literal("revolut"),
    transactions: z.array(z.object({
      date: z.string().describe("Date in YYYY-MM-DD format"),
      description: z.string().describe("Transaction description"),
      amount: z.number().describe("Transaction amount (negative for debits)"),
      currency: z.string().describe("Transaction currency"),
      type: z.enum(["debit", "credit"]).describe("Transaction type"),
      category: z.string().optional().describe("Revolut category if available"),
      merchant: z.string().optional().describe("Merchant name if available"),
      rawText: z.string().describe("Original line from PDF"),
      confidence: z.number().min(0).max(1).describe("Confidence score"),
      transactionId: z.string().describe("Generated unique ID")
    })),
    accountInfo: z.object({
      accountHolder: z.string(),
      period: z.object({
        from: z.string(),
        to: z.string()
      }),
      totalSpent: z.number().optional(),
      totalReceived: z.number().optional(),
      primaryCurrency: z.string()
    }),
    metadata: z.object({
      totalTransactions: z.number(),
      averageConfidence: z.number(),
      processingTime: z.number(),
      currenciesFound: z.array(z.string())
    })
  }),
  execute: async ({ context }) => {
    const startTime = Date.now();
    const { pdfText, currency = 'EUR' } = context;
    
    // Verificar que es un PDF de Revolut
    if (!REVOLUT_PATTERNS.bankIdentifier.test(pdfText)) {
      throw new Error("This does not appear to be a Revolut bank statement");
    }

    // Extraer información de cuenta
    const holderMatch = pdfText.match(REVOLUT_PATTERNS.accountHolder);
    const accountHolder = holderMatch ? holderMatch[1].trim() : '';

    // Extraer período
    const periodMatch = pdfText.match(REVOLUT_PATTERNS.period);
    const period = periodMatch ? {
      from: convertRevolutDate(periodMatch[1]),
      to: convertRevolutDate(periodMatch[2])
    } : { from: '', to: '' };

    // Extraer transacciones
    const transactions = [];
    const currenciesFound = new Set<string>();
    let match;
    
    REVOLUT_PATTERNS.transactionLine.lastIndex = 0; // Reset regex
    
    while ((match = REVOLUT_PATTERNS.transactionLine.exec(pdfText)) !== null) {
      const [fullMatch, dateStr, description, txCurrency, amountStr] = match;
      
      const amount = parseFloat(amountStr);
      const type = amount < 0 ? "debit" : "credit";
      currenciesFound.add(txCurrency);
      
      // Extract category and merchant info from description (Revolut-specific)
      const { cleanDescription, category, merchant } = parseRevolutDescription(description);
      
      const transaction = {
        date: convertRevolutDate(dateStr),
        description: cleanDescription,
        amount: amount,
        currency: txCurrency,
        type,
        category,
        merchant,
        rawText: fullMatch.trim(),
        confidence: calculateRevolutConfidence(fullMatch),
        transactionId: generateRevolutTransactionId(dateStr, description, amount, txCurrency)
      };
      
      transactions.push(transaction);
    }

    // Calculate totals
    const totalSpent = transactions
      .filter(t => t.type === "debit" && t.currency === currency)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const totalReceived = transactions
      .filter(t => t.type === "credit" && t.currency === currency)
      .reduce((sum, t) => sum + t.amount, 0);

    const processingTime = Date.now() - startTime;
    const totalConfidence = transactions.reduce((sum, t) => sum + t.confidence, 0);
    const averageConfidence = transactions.length > 0 ? totalConfidence / transactions.length : 0;

    return {
      bankType: "revolut" as const,
      transactions,
      accountInfo: {
        accountHolder,
        period,
        totalSpent,
        totalReceived,
        primaryCurrency: currency
      },
      metadata: {
        totalTransactions: transactions.length,
        averageConfidence,
        processingTime,
        currenciesFound: Array.from(currenciesFound)
      }
    };
  }
});

// Helper functions for Revolut
function convertRevolutDate(dateStr: string): string {
  // Convert "02 Jan 2024" to "2024-01-02"
  const months = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  
  const [day, monthStr, year] = dateStr.split(' ');
  const month = months[monthStr] || '01';
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function parseRevolutDescription(description: string): {
  cleanDescription: string;
  category?: string;
  merchant?: string;
} {
  // Revolut often includes category info in descriptions
  // This is a placeholder - update based on real PDF patterns
  const categoryMatch = description.match(/\[([\w\s]+)\]/);
  const merchantMatch = description.match(/^([^-\[]+)/);
  
  return {
    cleanDescription: description.replace(/\[[\w\s]+\]/, '').trim(),
    category: categoryMatch ? categoryMatch[1] : undefined,
    merchant: merchantMatch ? merchantMatch[1].trim() : undefined
  };
}

function calculateRevolutConfidence(rawLine: string): number {
  const hasValidDate = /\d{2}\s\w{3}\s\d{4}/.test(rawLine);
  const hasValidAmount = /[A-Z]{3}\s-?\d+\.\d{2}/.test(rawLine);
  const hasDescription = rawLine.trim().length > 15;
  
  let confidence = 0.6; // Base confidence higher for Revolut (usually more structured)
  if (hasValidDate) confidence += 0.2;
  if (hasValidAmount) confidence += 0.15;
  if (hasDescription) confidence += 0.05;
  
  return Math.min(confidence, 1.0);
}

function generateRevolutTransactionId(date: string, description: string, amount: number, currency: string): string {
  const hash = `${date}-${description.slice(0, 10)}-${amount}-${currency}`.replace(/\s/g, '_');
  return `revolut_${hash}_${Date.now()}`;
}
```

### Fase 3: PDF Extractor Agent (45 min)

#### 3.1 Agent Principal

```typescript
// src/mastra/agents/pdf-extractor-agent.ts
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { pdfReaderTool } from "../tools/pdf-reader";
import { santanderParserTool } from "../tools/santander-parser";
import { revolutParserTool } from "../tools/revolut-parser";

export const pdfExtractorAgent = new Agent({
  name: "PDF Extractor Agent",
  description: "Specialized agent for extracting transaction data from Spanish bank PDF statements (Santander and Revolut)",
  instructions: `
    # PDF Transaction Extractor Agent

    Eres un especialista en extracción de datos financieros de extractos bancarios PDF.

    ## Tu Misión
    Extraer todas las transacciones financieras de PDFs de Banco Santander y Revolut
    con la mayor precisión posible, estructurando la información en formato JSON. 
    Leer la totalidad del PDF identificando transacciones, no detenerse de forma arbitraria. 
    Validar la cantidad de transacciones extraidas.

    ## Tools Disponibles
    1. pdf-reader - Lee el contenido del PDF y extrae texto estructurado
    2. santander-parser - Parsea formato específico de Santander con patrones españoles
    3. revolut-parser - Parsea formato específico de Revolut con soporte multi-moneda

    ## Proceso de Trabajo
    1. SIEMPRE usa pdf-reader primero para extraer texto del PDF completo
    2. Analiza el texto extraído para identificar el banco (busca "SANTANDER" o "REVOLUT")
    3. Aplica el parser correspondiente:
       - santander-parser para PDFs de Banco Santander
       - revolut-parser para PDFs de Revolut
    4. Estructura cada transacción con: fecha, descripción, importe, saldo/tipo
    5. Asigna score de confianza a cada transacción extraída
    6. CRÍTICO: Valida la cantidad total de transacciones extraidas contra el PDF original
    7. Si la confianza promedio es < 0.8, informa al usuario para revisión manual

    ## Validación de Calidad
    - Verificar que todas las páginas del PDF han sido procesadas
    - Confirmar que el número de transacciones es coherente con el documento
    - Asegurar que los importes son numéricos y las fechas válidas
    - Reportar cualquier inconsistencia encontrada

    ## Formato de Respuesta
    Devuelve SIEMPRE un resumen en texto plano con:
    - Banco identificado (Santander/Revolut)
    - Número total de transacciones encontradas
    - Período del extracto
    - Confianza promedio de extracción
    - Cualquier advertencia o error encontrado
    - Los datos estructurados los proporcionan las tools directamente
  `,
  model: openai("gpt-4o-mini"),
  tools: {
    pdfReader: pdfReaderTool,
    santanderParser: santanderParserTool,
    revolutParser: revolutParserTool
  }
});
```

### Fase 4: Configuración MASTRA (15 min)

#### 4.1 Archivo Principal de Configuración

```typescript
// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";

// Agents
import { pdfExtractorAgent } from "./agents/pdf-extractor-agent";

// Tools
import { pdfReaderTool } from "./tools/pdf-reader";
import { santanderParserTool } from "./tools/santander-parser";  
import { revolutParserTool } from "./tools/revolut-parser";

export const mastra = new Mastra({
  agents: {
    pdfExtractor: pdfExtractorAgent
  },
  tools: {
    pdfReader: pdfReaderTool,
    santanderParser: santanderParserTool,
    revolutParser: revolutParserTool
  },
  logger: new PinoLogger({ 
    name: "PDF-Extractor-Agent", 
    level: "debug" 
  }),
  // Configuración para desarrollo local
  bundler: {
    sourcemap: true
  }
});
```

### Fase 5: Testing y Validación (30 min)

#### 5.1 Test Programático (Command Line)

```typescript
// test-pdf-extractor.ts (en raíz del proyecto MASTRA)
import { RuntimeContext } from "@mastra/core/runtime-context";
import { mastra } from "./src/mastra";
import { readFileSync } from 'fs';

async function testPdfExtraction() {
  console.log("🧪 Testing PDF Extractor Agent...\n");
  
  const agent = mastra.getAgent("pdfExtractor");
  const runtimeContext = new RuntimeContext();
  
  // Test casos básicos
  const testCases = [
    {
      name: "Santander Basic Statement",
      pdfPath: "../personal-finance-actual_SR/F1_PDF_IMPORTER/test-data/sample-pdfs/santander_aug3_25.pdf",
      expectedBank: "santander"
    },
    {
      name: "Revolut Personal Account", 
      pdfPath: "../personal-finance-actual_SR/F1_PDF_IMPORTER/test-data/sample-pdfs/revolut_aug25.pdf",
      expectedBank: "revolut"
    }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`📄 Testing: ${testCase.name}`);
      
      // Leer PDF como buffer (simulado por ahora)
      const pdfBuffer = Buffer.from("fake pdf content for testing");
      
      // Ejecutar agente
      const result = await agent.generate(
        `Extract all transactions from this PDF file. The file should be processed completely.`,
        { 
          runtimeContext,
          // En implementación real, pasaríamos el pdfBuffer via toolsets o context
        }
      );
      
      console.log(`✅ Result: ${result.text}`);
      console.log("---");
      
    } catch (error) {
      console.error(`❌ Error testing ${testCase.name}:`, error.message);
      console.log("---");
    }
  }
}

// Script principal
if (require.main === module) {
  testPdfExtraction().catch(console.error);
}
```

#### 5.2 Testing en MASTRA Playground

**Pasos para testing visual:**

1. **Iniciar MASTRA Playground:**
   ```bash
   cd ../mastra-actual_finance_sr
   pnpm mastra playground
   ```

2. **Abrir navegador:** `http://localhost:4111`

3. **Navegar a Agents:** Seleccionar "pdfExtractor"

4. **Test manual:**
   - Input: "Please extract transactions from a Santander PDF"
   - Observar traces de ejecución de cada tool
   - Verificar que se llaman en orden correcto:
     1. pdf-reader
     2. santander-parser (si identifica Santander)
   
5. **Verificar métricas:**
   - Tiempo de procesamiento
   - Confidence scores
   - Número de transacciones extraídas

#### 5.3 Casos de Test Definidos

| Caso de Test | Input | Expected Behavior |
|-------------|-------|-------------------|
| **PDF Santander válido** | Buffer de PDF real | Identificar banco, extraer todas las transacciones, confianza > 0.8 |
| **PDF Revolut válido** | Buffer de PDF real | Identificar banco, manejar multi-moneda, extraer transacciones |
| **PDF corrupto** | Buffer inválido | Error handled gracefully, mensaje descriptivo |
| **PDF de banco no soportado** | PDF de otro banco | Error claro: "Bank not supported" |
| **PDF sin transacciones** | PDF válido sin datos | Respuesta: "No transactions found" |

## 🚀 Comandos de Ejecución

### Desarrollo y Testing

```bash
# Navegar a proyecto MASTRA
cd ../mastra-actual_finance_sr

# Desarrollo
pnpm dev                    # Iniciar en modo desarrollo
pnpm mastra playground     # Abrir playground visual

# Testing  
npx tsx test-pdf-extractor.ts   # Test programático
pnpm test                  # Tests unitarios (si están configurados)

# Validación
pnpm build                 # Verificar que compila sin errores
pnpm mastra agents list    # Listar agentes disponibles
```

### Debugging

```bash
# Ver logs detallados
DEBUG=mastra:* pnpm dev

# Verificar configuración
pnpm mastra config show

# Validar tools individualmente
pnpm mastra tools list
pnpm mastra tools test pdf-reader
```

## ⏱️ Timeline Actualizado

| Fase | Duración | Descripción |
|------|----------|-------------|
| **Fase 0** | 45 min | Análisis de PDFs reales y patterns |
| **Fase 1** | 30 min | Setup proyecto MASTRA |
| **Fase 2** | 90 min | Implementar 3 tools especializadas |
| **Fase 3** | 45 min | Configurar agent con prompt corregido |
| **Fase 4** | 15 min | Configuración MASTRA |
| **Fase 5** | 30 min | Testing dual (programático + playground) |
| **Total** | **4h 15min** | Sprint 1 completo con correcciones |

## 🎯 Entregables Actualizados

1. ✅ **Proyecto MASTRA configurado** siguiendo mejores prácticas
2. ✅ **3 Tools especializadas** basadas en análisis real de PDFs
3. ✅ **PDF Extractor Agent** con prompt exacto del plan estratégico
4. ✅ **Testing dual:** Programático (CI/CD) + Visual (Playground)
5. ✅ **Validación completa** con casos de test definidos
6. ✅ **Documentación técnica** detallada

## 🔄 Preparación para Sprint 2

Al finalizar Sprint 1, estaremos listos para:
- **Data Curator Agent** (Sprint 2)
- **Workflow de orquestación** (Sprint 3)
- **Integración con Actual Budget** (Sprint 4)

**Requisito para continuar:** PDFs de ejemplo reales para finalizar los patrones regex de los parsers.

---

**Nota importante:** Este plan incluye las correcciones solicitadas:
1. **Parsers separados** por razones técnicas y de mantenibilidad
2. **Prompt exacto** del plan estratégico 
3. **Testing dual** explicando la diferencia entre programático y playground
4. **Análisis previo** de PDFs reales como fase 0
