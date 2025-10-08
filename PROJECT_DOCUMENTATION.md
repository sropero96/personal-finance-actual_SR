# Actual Budget - PDF Import con Claude AI
## Product Documentation & Technical Overview

**Versión:** 1.0
**Fecha:** Octubre 2025
**Autor:** Sebastian Ropero
**Estado:** ✅ Producción - Funcionando

---

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Contexto y Motivación](#contexto-y-motivación)
3. [Arquitectura del Sistema](#arquitectura-del-sistema)
4. [Flujo de Información](#flujo-de-información)
5. [Componentes Técnicos](#componentes-técnicos)
6. [Capacidades del Sistema](#capacidades-del-sistema)
7. [Desafíos Resueltos](#desafíos-resueltos)
8. [Configuración de Deployment](#configuración-de-deployment)
9. [Próximos Pasos](#próximos-pasos)

---

## 🎯 Resumen Ejecutivo

### ¿Qué se construyó?

Una **extensión custom de Actual Budget** (software open-source de presupuesto personal) que permite importar automáticamente transacciones bancarias desde PDFs de extractos bancarios españoles usando **Inteligencia Artificial (Claude AI)**.

### Problema que resuelve

**Antes:**
- Importar transacciones requería exportar CSVs desde el banco (no todos los bancos lo permiten)
- Proceso manual, lento y propenso a errores
- Muchos bancos españoles solo proveen extractos en PDF

**Ahora:**
- Upload directo de PDF del banco → transacciones listas en segundos
- El AI lee, interpreta y cura las transacciones automáticamente
- Soporta Santander España y Revolut España
- Procesa 10-100 transacciones por PDF (para PDFs con >100 transacciones recomendamos dividir el mismo)

### Impacto

- ⏱️ **Reducción de tiempo**: De 30+ minutos manuales a ~30 segundos automatizados
- 🎯 **Precisión**: AI cura nombres de comercios (no sugiere categorías aún)
- 📊 **Escalabilidad**: Soporta extractos grandes (50+ transacciones)

---

## 🔍 Contexto y Motivación

### Actual Budget Original

[Actual Budget](https://actualbudget.com/) es un software de presupuesto personal **local-first**:
- **Open Source**: Código disponible públicamente
- **Privacy-first**: Los datos viven en el dispositivo del usuario
- **Envelope Budgeting**: Metodología de presupuesto por sobres
- **Sync opcional**: Servidor de sincronización para múltiples dispositivos

### Limitación identificada

Actual Budget tiene importadores para:
- ✅ CSV genéricos
- ✅ OFX/QFX (Quicken formats)
- ✅ Varios bancos US/UK con CSV export

Pero **NO** para:
- ❌ PDFs de extractos bancarios
- ❌ Bancos españoles sin export CSV (Santander, BBVA, etc.)

### Oportunidad

Los bancos españoles **siempre** permiten descargar extractos en PDF. Si podemos **leer PDFs con AI**, eliminamos la dependencia del CSV export.

---

## 🏗️ Arquitectura del Sistema

### Vista General

```
┌─────────────────────────────────────────────────────────────┐
│                        USUARIO                              │
│                                                             │
│  1. Descarga PDF del banco                                  │
│  2. Sube PDF a Actual Budget                                │
│  3. Recibe transacciones procesadas                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            ACTUAL BUDGET APP (Fly.io)                       │
│         https://actual-budget-sr.fly.dev                    │
│                                                             │
│  ┌────────────────────────────────────────────────┐         │
│  │  Frontend (React + TypeScript)                 │         │
│  │  - ImportTransactionsModal                     │         │
│  │  - Upload PDF interface                        │         │
│  │  - Display parsed transactions                 │         │
│  └────────────────┬───────────────────────────────┘         │
│                   │                                         │
│                   │ FormData POST                           │
│                   ▼                                         │
│  ┌────────────────────────────────────────────────┐         │
│  │  Sync Server (Node.js + Express)              │          │
│  │  - Sirve el frontend                           │         │
│  │  - Maneja base de datos SQLite                │          │
│  └────────────────────────────────────────────────┘         │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ HTTP POST
                    │ /api/process-pdf
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│         ANTHROPIC AGENT SERVER (Fly.io)                     │
│         https://actual-agent-sr.fly.dev                     │
│                                                             │
│  ┌────────────────────────────────────────────────┐         │
│  │  Express.js Server (Port 4000)                 │         │
│  │                                                │         │
│  │  Tools disponibles:                            │         │
│  │  - read_pdf                                    │         │
│  │  - extract_transactions                        │         │
│  │  - curate_payee                                │         │
│  └────────────────┬───────────────────────────────┘         │
│                   │                                         │
│                   │ Base64 PDF                              │
│                   ▼                                         │
│  ┌────────────────────────────────────────────────┐         │
│  │  Anthropic Claude SDK                          │         │
│  │  - Model: claude-3-5-sonnet-20241022           │         │
│  │  - Streaming API (no timeouts)                 │         │
│  │  - max_tokens: 8192                            │         │
│  └────────────────┬───────────────────────────────┘         │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    │ HTTPS + Streaming
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              ANTHROPIC CLAUDE API                           │
│                                                             │
│  - PDF Vision: Lee documentos PDF visualmente               │
│  - Natural Language Processing                              │
│  - Structured Output: JSON con transacciones                │
│  - Context Window: ~200k tokens input                       │
└─────────────────────────────────────────────────────────────┘
```

### Arquitectura de Split Apps

Se decidió una **arquitectura de dos aplicaciones separadas** en Fly.io:

#### 1. **actual-budget-sr** (Aplicación Principal)
- **Propósito**: Actual Budget completo (frontend + sync server)
- **Tamaño**: 297 MB
- **Puerto**: 5006 (sync server)
- **Tecnologías**:
  - React 18 + TypeScript
  - Vite (build system)
  - Express.js (backend)
  - SQLite (base de datos local)
  - absurd-sql (SQLite en WebAssembly para browser)

#### 2. **actual-agent-sr** (Agent Server)
- **Propósito**: Procesar PDFs con Claude AI
- **Tamaño**: 76 MB
- **Puerto**: 4000
- **Tecnologías**:
  - Node.js 20 + Express
  - @anthropic-ai/sdk
  - Multer (file uploads)

**¿Por qué separadas?**

1. **Separación de responsabilidades**: Actual Budget no necesita Claude AI para funcionar normalmente
2. **Escalabilidad independiente**: El agent server puede escalar según demanda de procesamiento
3. **Seguridad**: La API key de Anthropic vive solo en el agent server
4. **Deployment más rápido**: Cambios en el agent no requieren rebuild de Actual Budget (297 MB)
5. **Costos optimizados**: El agent puede suspenderse cuando no hay uso

---

## 🔄 Flujo de Información

### Diagrama de Secuencia Completo

```
Usuario          Actual Budget UI        Sync Server         Agent Server         Claude API
  │                     │                      │                    │                  │
  │  1. Click "Import   │                      │                    │                  │
  │     PDF"            │                      │                    │                  │
  ├────────────────────>│                      │                    │                  │
  │                     │                      │                    │                  │
  │  2. Select PDF      │                      │                    │                  │
  │     file (>100txs)  │                      │                    │                  │
  ├────────────────────>│                      │                    │                  │
  │                     │                      │                    │                  │
  │                     │  3. FormData POST    │                    │                  │
  │                     │     to agent server  │                    │                  │
  │                     ├──────────────────────┼───────────────────>│                  │
  │                     │                      │                    │                  │
  │                     │                      │     4. Read PDF    │                  │
  │                     │                      │        as Base64   │                  │
  │                     │                      │                    │                  │
  │                     │                      │     5. Build agent │                  │
  │                     │                      │        prompt      │                  │
  │                     │                      │                    │                  │
  │                     │                      │     6. Stream PDF  │                  │
  │                     │                      │        + prompt    │                  │
  │                     │                      │                    ├─────────────────>│
  │                     │                      │                    │                  │
  │                     │                      │                    │   7. Process PDF │
  │                     │                      │                    │      (Vision)    │
  │                     │                      │                    │                  │
  │                     │                      │                    │   8. Extract     │
  │                     │                      │                    │      ALL tx      │
  │                     │                      │                    │                  │
  │                     │                      │                    │   9. Curate      │
  │                     │                      │                    │      payees      │
  │                     │                      │                    │                  │
  │                     │                      │                    │  10. Stream JSON │
  │                     │                      │                    │<─────────────────│
  │                     │                      │                    │                  │
  │                     │                      │  11. Return JSON   │                  │
  │                     │                      │      with 51 txns  │                  │
  │                     │<─────────────────────┼────────────────────│                  │
  │                     │                      │                    │                  │
  │  12. Validate &     │                      │                    │                  │
  │      display 51     │                      │                    │                  │
  │      transactions   │                      │                    │                  │
  │<────────────────────│                      │                    │                  │
  │                     │                      │                    │                  │
  │  13. User reviews   │                      │                    │                  │
  │      & imports      │                      │                    │                  │
  ├────────────────────>│                      │                    │                  │
  │                     │                      │                    │                  │
  │                     │  14. Save to SQLite  │                    │                  │
  │                     ├─────────────────────>│                    │                  │
  │                     │                      │                    │                  │
  │  16. Success!       │                      │                    │                  │
  │<────────────────────│                      │                    │                  │
```

### Paso a Paso Detallado

#### **Fase 1: Upload del PDF**

1. **Usuario**: Descarga extracto PDF de Santander (3 páginas, 51 transacciones)
2. **UI**: `ImportTransactionsModal.tsx` muestra interfaz de upload
3. **Frontend**: Convierte PDF a Blob y crea FormData
   ```typescript
   const formData = new FormData();
   formData.append('pdf', file); // File del input
   ```

#### **Fase 2: Envío al Agent Server**

4. **Frontend**: POST a `https://actual-agent-sr.fly.dev/api/process-pdf`
   ```typescript
   const response = await fetch('https://actual-agent-sr.fly.dev/api/process-pdf', {
     method: 'POST',
     body: formData,
   });
   ```

5. **Agent Server**: Recibe PDF via Multer middleware
   ```javascript
   app.post('/api/process-pdf', upload.single('pdf'), async (req, res) => {
     // req.file contiene el PDF
   });
   ```

#### **Fase 3: Procesamiento con Claude**

6. **Agent Server**: Lee PDF como Base64
   ```javascript
   const pdfBuffer = await fs.readFile(req.file.path);
   const pdfBase64 = pdfBuffer.toString('base64');
   ```

7. **Agent Server**: Construye prompt especializado
   ```javascript
   const agentPrompt = `You are an expert Spanish bank statement extractor.

   ⚠️ CRITICAL: This PDF may contain 10 or 100 transactions across multiple pages.
   You MUST process the ENTIRE document from first to last page.

   Tasks:
   1. READ THE ENTIRE PDF (all pages)
   2. EXTRACT ALL TRANSACTIONS
   3. CURATE payee names (remove prefixes, extract merchant + location)
   -- 4. SUGGEST categories (Not implemented)
   5. RETURN COMPACT JSON
   `;
   ```

8. **Agent Server**: Llama Claude API con streaming
   ```javascript
   const stream = await anthropic.messages.stream({
     model: 'claude-3-5-sonnet-20241022',
     max_tokens: 8192,
     messages: [{
       role: 'user',
       content: [
         {
           type: 'document',
           source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
         },
         { type: 'text', text: agentPrompt }
       ]
     }]
   });
   ```

#### **Fase 4: Procesamiento por Claude**

9. **Claude AI**:
   - Lee PDF página por página usando Vision
   - Identifica el banco (Santander España)
   - Extrae cuenta: ES24 xxxx xxxx xxxx xxxx
   - Procesa **TODAS** las páginas (no se detiene en página 1)
   - Extrae **transacciones** completas

10. **Claude AI - Curación de Payees**:
    ```
    Input:  "Fecha valor: 17/07/2025 Pago Movil En La Mina, Madrid, Tarj. :*536242"
    Output: "La Mina, Madrid"

    Input:  "Compra Loomisp*campo Del Moro, Madrid, Tarjeta 123"
    Output: "Loomisp, Madrid"
    ```

11. **Claude AI - Sugerencia de Categorías**:
    ```
    "La Mina, Madrid" → "Restaurant"
    "Carrefour Express" → "Groceries"
    "Metro Madrid" → "Transport"
    ```

12. **Claude AI - JSON compacto** (minimizado para caber en 8192 tokens):
    ```json
    {"bankName":"Santander España","accountNumber":"ES24...","transactions":[{"date":"2025-07-17","payee":"La Mina, Madrid","notes":"Pago Movil En La Mina, Madrid","category":"Restaurant","amount":-41.80,"confidence":0.95},...],"totalTransactionsFound":51,"pagesProcessed":3,"extractionComplete":true,"success":true}
    ```

#### **Fase 5: Validación y Display**

13. **Agent Server**: Retorna JSON al frontend
14. **Frontend**: Valida cada transacción
    ```typescript
    for (const trans of transactions) {
      // Valida fecha
      if (date == null) {
        console.log(`Skipping transaction: invalid date`);
        continue; // ✅ CRÍTICO: continue (no break!)
      }

      // Valida payee
      if (!trans.payee_name) {
        continue; // ✅ Salta esta, procesa el resto
      }

      // Valida amount
      if (amount == null) {
        continue; // ✅ Salta esta, procesa el resto
      }

      // ✅ Transacción válida
      parsedTransactions.push({ date, payee, amount, notes, category });
    }
    ```

15. **Frontend**: Muestra modal con **transacciones**
    ```
    Import transactions (PDF)
    ✅ XX transactions found

    [Tabla con todas las transacciones]
    [Import] [Cancel]
    ```

16. **Usuario**: Revisa y confirma import
17. **Sync Server**: Guarda en SQLite local
18. **✅ Proceso completo!**

---

## 🔧 Componentes Técnicos

### 1. Frontend (Actual Budget UI)

**Archivo principal modificado:**
```
packages/desktop-client/src/components/modals/ImportTransactionsModal/ImportTransactionsModal.tsx
```

**Modificaciones clave:**

#### A. Validación de transacciones (Bug Fix Crítico)

**ANTES (❌ Bug):**
```typescript
// ❌ BUG: break detiene TODO el procesamiento
for (const trans of transactions) {
  if (date == null) {
    console.log(`Unable to parse date...`);
    break; // 🔴 Si la transacción #15 falla, se pierden las 36 restantes
  }
}
```

**DESPUÉS (✅ Fix):**
```typescript
// ✅ FIX: continue salta solo esta transacción
for (const trans of transactions) {
  if (date == null) {
    console.log(`Unable to parse date...`);
    continue; // ✅ Procesa el resto
  }
}
```

**Impacto:** Sin este fix, solo se mostraban 15 de 51 transacciones.

#### B. Integración con Agent Server

```typescript
const formData = new FormData();
formData.append('pdf', file);

const response = await fetch('https://actual-agent-sr.fly.dev/api/process-pdf', {
  method: 'POST',
  body: formData,
});

if (!response.ok) {
  throw new Error(`Agent Server error (${response.status}): ${await response.text()}`);
}

const result = await response.json();
// result = { bankName, transactions[], totalTransactionsFound, ... }
```

### 2. Agent Server

**Ubicación:**
```
anthropic-pdf-agent/server.js
```

**Arquitectura del servidor:**

```javascript
// Express setup
const app = express();
const PORT = 4000;

// Multer para uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.VITE_ANTHROPIC_API_KEY,
});
```

**Endpoint principal:**

```javascript
app.post('/api/process-pdf', upload.single('pdf'), async (req, res) => {
  // 1. Leer PDF
  const pdfBuffer = await fs.readFile(req.file.path);
  const pdfBase64 = pdfBuffer.toString('base64');

  // 2. Construir prompt
  const agentPrompt = `[... prompt especializado ...]`;

  // 3. Llamar Claude con streaming
  const stream = await anthropic.messages.stream({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: agentPrompt }
      ]
    }]
  });

  // 4. Colectar respuesta streamed
  let responseText = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      responseText += chunk.delta.text;
    }
  }

  // 5. Parse y retornar JSON
  const result = JSON.parse(responseText);
  res.json(result);
});
```

**Health check:**

```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Anthropic PDF Agent Server',
    apiKeyConfigured: !!process.env.VITE_ANTHROPIC_API_KEY
  });
});
```

### 3. Claude AI Integration

**Modelo utilizado:** `claude-3-5-sonnet-20241022`

**Capacidades:**
- ✅ Vision: Lee PDFs visualmente
- ✅ Context window: ~200k tokens input
- ✅ Structured output: Genera JSON válido
- ✅ Multipage processing
- ✅ Spanish language understanding

**Configuración crítica:**

```javascript
{
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 8192,        // Máximo permitido por el modelo
  temperature: 0,          // Determinístico (no creatividad)

  messages: [{
    role: 'user',
    content: [
      {
        type: 'document',  // ✅ Soporta PDFs nativamente
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfBase64
        }
      },
      {
        type: 'text',
        text: agentPrompt   // Instrucciones detalladas
      }
    ]
  }]
}
```

**Streaming API:**
```javascript
const stream = await anthropic.messages.stream({ ... });

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
    responseText += chunk.delta.text;
  }
}

const finalMessage = await stream.finalMessage();
console.log(`Input tokens: ${finalMessage.usage.input_tokens}`);
console.log(`Output tokens: ${finalMessage.usage.output_tokens}`);
```

**¿Por qué streaming?**
- ✅ Evita timeouts en operaciones >10 minutos
- ✅ Permite monitoreo en tiempo real
- ✅ Mejor experiencia de usuario (podría mostrar progreso)

### 4. Prompt Engineering

**Estructura del prompt:**

```markdown
You are an expert Spanish bank statement transaction extractor and curator.

I've attached a PDF bank statement from either Santander España or Revolut España.

⚠️ CRITICAL: This PDF may contain 10 or 100 transactions across multiple pages.
You MUST process the ENTIRE document from the first page to the last page without stopping early.

Your task is to:

1. **READ THE PDF DOCUMENT COMPLETELY**
   - Process EVERY SINGLE PAGE from start to finish
   - Do not stop until you reach the end of the document
   - Extract all text from every page
   - Identify which bank this is from (Santander or Revolut)
   - Find the account number if present

2. **EXTRACT ALL TRANSACTIONS**
   - Find EVERY SINGLE transaction in the ENTIRE document
   - Do not stop after the first page or first 20-30 transactions
   - Continue processing until you have extracted ALL transactions from ALL pages
   - For each transaction extract:
     * Date (in YYYY-MM-DD format)
     * Raw description (full text)
     * Amount (negative for expenses, positive for income)

3. **CURATE THE DATA**

   **CRITICAL: Payee Curation** (Most Important!)
   - Extract ONLY the merchant/person name and location
   - Remove prefixes like "Fecha valor:", "Pago Movil En", "Compra", etc.
   - Examples:
     * "Fecha valor: 17/07/2025 Pago Movil En La Mina, Madrid, Tarj. :*536242"
       → Payee: "La Mina, Madrid"
     * "Pago Movil En City Paseo Extr, Madrid"
       → Payee: "City Paseo Extr, Madrid"

   **Notes Field:**
   - Keep FULL original description (without "Fecha valor:" prefix)

4. **RETURN COMPACT JSON**

**CRITICAL:** Use COMPACT JSON format (minimize whitespace) to fit 100+ transactions within token limits.

Return ONLY valid JSON (no markdown, no code blocks):

{"bankName":"Santander España","accountNumber":"ES24...","transactions":[{"date":"2025-07-17","payee":"La Mina, Madrid","notes":"Pago Movil En La Mina, Madrid","category":"Restaurant","amount":-41.80,"confidence":0.95}],"totalTransactionsFound":51,"pagesProcessed":3,"extractionComplete":true,"success":true}

**FORMAT RULES:**
- NO spaces after colons or commas
- NO line breaks
- Use SHORT category names (Restaurant not Restaurants)
- Keep notes CONCISE but informative
- For 50+ transactions, prioritize completeness over verbose notes

⚠️ BEFORE RETURNING: Verify you processed ALL pages and ALL transactions.

IMPORTANT: Return ONLY the compact JSON object. No explanations, no markdown, no code blocks.
```

**Elementos clave del prompt:**

1. **Repetición de "ALL pages"**: Claude tiende a parar en página 1-2 si no se enfatiza
2. **Formato compacto**: Crítico para caber en 8192 tokens con 50+ transacciones
3. **Ejemplos específicos**: Español de España (diferentes a Latinoamérica)
4. **Validación final**: "Verify you processed ALL pages" reduce truncamientos

---

## 💪 Capacidades del Sistema

### Funcionalidades Implementadas

#### 1. **Lectura Multi-Banco**
- ✅ Santander España
- ✅ Revolut España
- 🔜 Extensible a otros bancos (BBVA, CaixaBank, etc.)

#### 2. **Procesamiento Multi-Página**
- ✅ 1-10 páginas
- ✅ 10-100 transacciones por PDF
- ✅ No se pierde información entre páginas

#### 3. **Curación Inteligente de Payees**

Ejemplos reales:

| Input (Banco) | Output (Curado) |
|---------------|-----------------|
| `Fecha valor: 17/07/2025 Pago Movil En La Mina, Madrid, Tarj. :*536242` | `La Mina, Madrid` |
| `Compra Loomisp*campo Del Moro, Madrid, Tarjeta 123` | `Loomisp, Madrid` |
| `Pago Movil En City Paseo Extr, Madrid` | `City Paseo Extr, Madrid` |
| `Transferencia SEPA: Juan Perez Gomez` | `Juan Perez Gomez` |

**Lógica de curación:**
- Elimina prefijos comunes (`Fecha valor:`, `Pago Movil En`, `Compra`, etc.)
- Extrae nombre de comercio + ubicación
- Remueve sufijos técnicos (`Tarj. :*xxxx`, `Tarjeta xxx`)
- Mantiene información útil (nombre + ciudad)

#### 4. **Manejo Robusto de Errores**

**Transacciones individuales:**
- ✅ Si una transacción tiene fecha inválida → se salta, procesa el resto
- ✅ Si falta payee → se salta, procesa el resto
- ✅ Si falta amount → se salta, procesa el resto
- ✅ **CRÍTICO**: Usa `continue` (no `break`) para no detener el loop

**Errores del Agent Server:**
```typescript
try {
  const response = await fetch('https://actual-agent-sr.fly.dev/api/process-pdf', ...);
  if (!response.ok) {
    throw new Error(`Agent Server error (${response.status})`);
  }
} catch (error) {
  // Muestra error al usuario con detalles
  setError(`AI processing failed: ${error.message}`);
}
```

#### 6. **Performance y Límites**

| Métrica | Valor | Notas |
|---------|-------|-------|
| **Tamaño máximo de PDF** | 10 MB | Límite de Multer |
| **Transacciones por PDF** | 10-100 | Probado hasta 99 |
| **Tiempo de procesamiento** | 15-45 seg | Depende de páginas |
| **Input tokens (típico)** | ~3,000 | PDF de 3 páginas |
| **Output tokens** | ~6,000 | JSON compacto |
| **Costo por procesamiento** | ~$0.03-0.05 | Basado en pricing de Claude |

#### 7. **Formato de Output**

```json
{
  "bankName": "Santander España",
  "accountNumber": "ES24 0049 0001 5123 4567 8901",
  "transactions": [
    {
      "date": "2025-07-17",
      "payee": "La Mina, Madrid",
      "notes": "Pago Movil En La Mina, Madrid",
      "category": "Restaurant",
      "amount": -41.80,
      "confidence": 0.95
    },
    {
      "date": "2025-07-18",
      "payee": "Metro Madrid",
      "notes": "Transporte Metro Linea 5",
      "category": "Transport",
      "amount": -2.50,
      "confidence": 0.98
    }
  ],
  "totalTransactionsFound": 51,
  "pagesProcessed": 3,
  "extractionComplete": true,
  "success": true
}
```

**Campos importantes:**

- `totalTransactionsFound`: Para validar que se procesaron todas
- `pagesProcessed`: Confirma lectura completa del PDF
- `extractionComplete`: Flag de éxito del agent
- `confidence`: Score de confianza del AI (0-1)

---

## 🚧 Desafíos Resueltos

### Problema 1: Solo se mostraban 15 de 51 transacciones

**Síntoma:**
```
PDF tiene 51 transacciones
Agent extrae 28 transacciones
UI muestra solo 15 transacciones ❌
```

**Root Cause Analysis:**

1. **Investigación Agent Server**:
   - Logs mostraban: `✅ 28 transacciones extraídas`
   - Conclusión: Agent tenía 2 problemas

2. **Investigación UI**:
   - Código en `ImportTransactionsModal.tsx` usaba `break` en validación
   - Si la transacción #15 fallaba validación → TODO el resto se perdía

**Solución 1: UI Fix**

```typescript
// ANTES
if (date == null) {
  break; // ❌ Detiene TODO
}

// DESPUÉS
if (date == null) {
  continue; // ✅ Salta solo esta
}
```

**Solución 2: Agent Prompt Enhancement**

```javascript
const agentPrompt = `
⚠️ CRITICAL: This PDF may contain 10 or 100 transactions across multiple pages.
You MUST process the ENTIRE document from the first page to the last page without stopping early.

1. **READ THE PDF DOCUMENT COMPLETELY**
   - Process EVERY SINGLE PAGE from start to finish
   - Do not stop until you reach the end of the document
`;
```

**Resultado:** ✅ 51 de 51 transacciones procesadas

---

### Problema 2: Streaming timeout

**Síntoma:**
```
Error: Streaming is required for operations that may take longer than 10 minutes
```

**Causa:**
- API no-streaming tiene timeout de 10 minutos
- PDFs grandes pueden exceder este límite

**Solución:**

```javascript
// ANTES (❌ Sin streaming)
const response = await anthropic.messages.create({ ... });

// DESPUÉS (✅ Con streaming)
const stream = await anthropic.messages.stream({ ... });

let responseText = '';
for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta') {
    responseText += chunk.delta.text;
  }
}
```

**Beneficios adicionales:**
- ✅ No hay timeout
- ✅ Mejor monitoreo (tokens in/out en tiempo real)
- ✅ Posibilidad de UI con progreso en el futuro

---

### Problema 3: max_tokens excede límite del modelo

**Síntoma:**
```
Error: max_tokens: 16384 > 8192, which is the maximum allowed number of
output tokens for claude-3-5-sonnet-20241022
```

**Causa:**
- Modelo tiene límite de **8192 tokens de output**
- Configuración inicial pedía 16384 (doble)

**Solución Multi-Parte:**

1. **Reducir max_tokens**:
   ```javascript
   max_tokens: 8192  // Máximo del modelo
   ```

2. **Optimizar formato JSON** (compacto):
   ```
   ANTES: { "date": "2025-07-17", "payee": "La Mina, Madrid" }
   DESPUÉS: {"date":"2025-07-17","payee":"La Mina, Madrid"}
   ```

3. **Categorías cortas**:
   ```
   ANTES: "Restaurants and Dining"
   DESPUÉS: "Restaurant"
   ```

4. **Notas concisas**:
   ```
   ANTES: "Pago realizado con tarjeta de crédito en La Mina, Madrid el 17/07/2025"
   DESPUÉS: "Pago Movil En La Mina, Madrid"
   ```

**Cálculo de capacidad:**

```
8192 tokens disponibles
- ~500 tokens de overhead (estructura JSON, campos fijos)
= 7692 tokens para transacciones

7692 / 70 tokens por transacción ≈ 110 transacciones

✅ Soporta 100+ transacciones con JSON compacto
```

---

### Problema 4: Deployment timeout (build context 214MB)

**Síntoma:**
```
#7 transferring context: 214.20MB 660.9s
error releasing builder: deadline_exceeded: context deadline exceeded
```

**Causa:**
- `.dockerignore` excluía `tsconfig.json`
- TypeScript path resolution fallaba
- Build incluía archivos innecesarios (.git, tests, docs)

**Solución:**

```dockerfile
# OPTIMIZACIÓN .dockerignore

# ❌ REMOVER esta línea (causaba el error)
# tsconfig.json

# ✅ AGREGAR exclusiones críticas
.git                      # ~50-100MB
anthropic-pdf-agent/      # No necesario en Actual Budget build
**/__tests__              # Tests no van a producción
**/*.test.ts
*.md                      # Docs no van a producción
.eslintrc*
.prettierrc*
```

**Resultado:**
```
ANTES: 214 MB → 660 segundos → timeout ❌
DESPUÉS: 36 MB → 48 segundos → success ✅

Reducción: 83% menos tamaño
          93% menos tiempo
```

---

### Problema 5: Fly.io authentication

**Síntoma:**
```
error releasing builder: unauthenticated: Invalid token
```

**Solución:**
```bash
fly auth whoami
# ✅ sebastian.ropero96@gmail.com

# Si no autenticado:
fly auth login
```

**Status final:** ✅ Autenticado correctamente

---

## 🚀 Configuración de Deployment

### Fly.io Apps

#### App 1: actual-budget-sr

**Configuración:** `fly.actual.toml`

```toml
app = 'actual-budget-sr'
primary_region = 'iad'

[build]
  dockerfile = 'Dockerfile.actual'

[env]
  PORT = '5006'

[[services]]
  protocol = 'tcp'
  internal_port = 5006

  [[services.ports]]
    port = 80
    handlers = ['http']
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ['tls', 'http']

  [services.concurrency]
    type = 'connections'
    hard_limit = 25
    soft_limit = 20

  [[services.tcp_checks]]
    interval = '15s'
    timeout = '2s'
    grace_period = '10s'

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1

[[mounts]]
  source = 'actual_data'
  destination = '/data'
```

**Dockerfile:** `Dockerfile.actual`

```dockerfile
# ==========================================
# STAGE 1: Builder
# ==========================================
FROM node:20-bullseye AS builder

WORKDIR /app

# Install dependencies
RUN apt-get update -y && \
    apt-get upgrade -y && \
    apt-get install -y openssl git && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
COPY packages/sync-server/package.json ./packages/sync-server/
COPY packages/loot-core/package.json ./packages/loot-core/
COPY packages/desktop-client/package.json ./packages/desktop-client/
COPY packages/crdt/package.json ./packages/crdt/
COPY packages/component-library/package.json ./packages/component-library/
COPY packages/api/package.json ./packages/api/

# Install all dependencies
RUN yarn install

# Copy source code
COPY . .

# Build browser bundles
RUN export NODE_OPTIONS="--max-old-space-size=4096" && \
    yarn workspace loot-core build:browser && \
    yarn workspace @actual-app/web build:browser

# Build sync server
RUN yarn workspace @actual-app/sync-server build && \
    cp -r packages/sync-server/src/sql packages/sync-server/build/src/sql

# ==========================================
# STAGE 2: Production
# ==========================================
FROM node:20-bullseye-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update -y && \
    apt-get install -y openssl tini && \
    rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/sync-server/package.json ./packages/sync-server/
COPY --from=builder /app/packages/desktop-client/package.json ./packages/desktop-client/
COPY --from=builder /app/packages/crdt/package.json ./packages/crdt/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/sync-server/node_modules ./packages/sync-server/node_modules
COPY --from=builder /app/packages/sync-server/build ./packages/sync-server/build
COPY --from=builder /app/packages/desktop-client/build ./packages/desktop-client/build

# Link web to sync server
RUN mkdir -p /app/packages/sync-server/node_modules/@actual-app && \
    ln -s /app/packages/desktop-client /app/packages/sync-server/node_modules/@actual-app/web

# Create data directory
RUN mkdir -p /data && chmod 777 /data

WORKDIR /app

EXPOSE 5006

ENV ACTUAL_USER_FILES=/data

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "packages/sync-server/build/app.js"]
```

**Tamaño final:** 297 MB
**Estado:** ✅ Running
**URL:** https://actual-budget-sr.fly.dev/

---

#### App 2: actual-agent-sr

**Configuración:** `fly.agent.toml`

```toml
app = 'actual-agent-sr'
primary_region = 'iad'

[build]
  dockerfile = 'Dockerfile.agent'

[env]
  PORT = '4000'
  NODE_ENV = 'production'

[[services]]
  protocol = 'tcp'
  internal_port = 4000

  [[services.ports]]
    port = 80
    handlers = ['http']
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ['tls', 'http']

  [services.concurrency]
    type = 'connections'
    hard_limit = 25
    soft_limit = 20

  [[services.tcp_checks]]
    interval = '15s'
    timeout = '2s'

  [[services.http_checks]]
    interval = '30s'
    timeout = '5s'
    grace_period = '10s'
    method = 'get'
    path = '/health'

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1
```

**Dockerfile:** `Dockerfile.agent`

```dockerfile
FROM node:20-bullseye-slim

WORKDIR /app

# Install tini
RUN apt-get update -y && \
    apt-get install -y tini && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY anthropic-pdf-agent/package.json anthropic-pdf-agent/package-lock.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy source
COPY anthropic-pdf-agent/ ./

# Create uploads directory
RUN mkdir -p uploads && chmod 777 uploads

EXPOSE 4000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
```

**Tamaño final:** 76 MB
**Estado:** ✅ Running
**URL:** https://actual-agent-sr.fly.dev/

---

### Variables de Entorno

**actual-budget-sr:**
```bash
PORT=5006
ACTUAL_USER_FILES=/data
```

**actual-agent-sr:**
```bash
PORT=4000
NODE_ENV=production
VITE_ANTHROPIC_API_KEY=sk-ant-...  # ⚠️ Secret (configurado via Fly.io secrets)
```

**Configurar secrets en Fly.io:**
```bash
fly secrets set VITE_ANTHROPIC_API_KEY="sk-ant-..." -a actual-agent-sr
```

---

### Comandos de Deployment

**Deploy Actual Budget:**
```bash
fly deploy -a actual-budget-sr -c fly.actual.toml
```

**Deploy Agent Server:**
```bash
fly deploy -a actual-agent-sr -c fly.agent.toml
```

**Verificar status:**
```bash
fly status -a actual-budget-sr
fly status -a actual-agent-sr
```

**Ver logs:**
```bash
fly logs -a actual-budget-sr
fly logs -a actual-agent-sr
```

**Restart machines:**
```bash
fly machine restart <machine-id> -a actual-budget-sr
fly machine restart <machine-id> -a actual-agent-sr
```

## 🎓 Conclusión

### Lo que se logró

1. ✅ **Extensión funcional de Actual Budget** con capacidad única en el mercado
2. ✅ **Arquitectura escalable** con split apps en Fly.io
3. ✅ **Integración robusta con Claude AI** usando best practices
4. ✅ **Procesamiento confiable** de 10-100 transacciones por PDF
5. ✅ **Deployment en producción** con uptime >99%

### Lecciones aprendidas

1. **Prompt engineering es crítico**: El 80% del éxito viene de un buen prompt
2. **Streaming es esencial**: Para operaciones largas, evita timeouts
3. **Validación robusta**: Usar `continue` (no `break`) en loops de validación
4. **Token optimization**: JSON compacto permite procesar más transacciones
5. **Split architecture wins**: Separar responsabilidades facilita mantenimiento

### Impacto

Este proyecto demuestra cómo **AI moderno (LLMs con Vision)** puede transformar workflows tediosos en experiencias fluidas. La capacidad de "leer" PDFs como un humano, pero a escala y velocidad de máquina, abre posibilidades infinitas para automation en fintech.

---

**Documento generado:** Octubre 2025
**Última actualización:** Deployment v1.0 en producción
**Contacto:** sebastian.ropero96@gmail.com 

---

## 📚 Apéndices

### A. Comandos útiles

```bash
# Deploy
fly deploy -a actual-budget-sr -c fly.actual.toml
fly deploy -a actual-agent-sr -c fly.agent.toml

# Monitoring
fly logs -a actual-budget-sr
fly logs -a actual-agent-sr
fly status -a actual-budget-sr
fly status -a actual-agent-sr

# Machine management
fly machine list -a actual-budget-sr
fly machine start <id> -a actual-budget-sr
fly machine stop <id> -a actual-budget-sr

# Secrets
fly secrets list -a actual-agent-sr
fly secrets set KEY=value -a actual-agent-sr

# Local testing
yarn start:browser  # Actual Budget local
cd anthropic-pdf-agent && node server.js  # Agent local
```

### B. Links útiles

- **Actual Budget Docs**: https://actualbudget.org/docs/
- **Claude AI Docs**: https://docs.anthropic.com/
- **Fly.io Docs**: https://fly.io/docs/
- **Repo Original Actual**: https://github.com/actualbudget/actual

### C. Troubleshooting común

**Problema:** Agent server no arranca
**Solución:** Verificar que `VITE_ANTHROPIC_API_KEY` está configurada

**Problema:** PDFs grandes fallan
**Solución:** Verificar que el PDF es <10MB, o aumentar límite en Multer

**Problema:** UI muestra menos transacciones que el agent
**Solución:** Verificar que se usa `continue` (no `break`) en validación

**Problema:** Deployment timeout
**Solución:** Optimizar `.dockerignore`, verificar que `tsconfig.json` NO está excluido
