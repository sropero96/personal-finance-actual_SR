# 🤖 Integración PDF Agent con Actual Budget

## 📊 Resumen

Este proyecto integra un agente de IA (Mastra) para procesar extractos bancarios en PDF de Santander y Revolut España, extrayendo transacciones automáticamente para importarlas en Actual Budget.

## 🏗️ Arquitectura

```
Usuario sube PDF → Actual UI → loot-core (parse-file.ts) →
pdf-adapter.ts → HTTP POST :5055/extract →
server.ts (wrapper) → Mastra API :4112 →
pdfExtractorAgent (GPT-4o-mini) → Transacciones JSON →
Importación en Actual Budget
```

## ⚙️ Prerequisitos

✅ Node.js >= 20.9.0
✅ API Key de OpenAI configurada
✅ Yarn instalado

## 🚀 Inicio Rápido

### 1. Configurar Variables de Entorno

El archivo `.env` ya está configurado con:
```bash
OPENAI_API_KEY=tu-key-aqui
PDF_AGENT_PORT=5055
MASTRA_API_URL=http://localhost:4112/api
```

### 2. Iniciar el Servicio PDF

**Opción A: Script Automático (Recomendado)**
```bash
cd MASTRA-PDF-IMPORTER
./start-pdf-service.sh
```

Este script:
- ✅ Verifica configuración
- ✅ Inicia Mastra Dev (puerto 4112)
- ✅ Inicia servidor HTTP wrapper (puerto 5055)
- ✅ Muestra logs en tiempo real

**Opción B: Manual (dos terminales)**

Terminal 1 - Mastra Dev:
```bash
cd MASTRA-PDF-IMPORTER
npm run dev
# Espera a que esté listo en http://localhost:4112
```

Terminal 2 - Servidor HTTP:
```bash
cd MASTRA-PDF-IMPORTER
npm run server
# Escuchando en http://localhost:5055
```

### 3. Iniciar Actual Budget

En otra terminal:
```bash
cd /Users/sebiropero_personal/sropero/Developer/personal-finance-actual_SR
yarn start:browser
```

## 🧪 Testing Paso a Paso

### Test 1: Verificar Servicios

```bash
# Verificar Mastra API
curl http://localhost:4112

# Verificar Servidor PDF
curl http://localhost:5055
```

Deberías ver respuestas de ambos servicios.

### Test 2: Importar PDF en Actual

1. **Abre Actual Budget** en el navegador (http://localhost:3001)

2. **Ve a una cuenta** (Account page)

3. **Haz clic en "Import"** (o usa el menú)

4. **Selecciona un archivo PDF**:
   - ✅ Los archivos .pdf ahora aparecen en el selector
   - ✅ Elige un extracto de Santander o Revolut

5. **Observa el procesamiento**:
   - 🔄 Verás "Processing PDF with AI... This may take a few moments."
   - ⏱️ El agente tarda ~10-30 segundos dependiendo del PDF
   - ✅ Al terminar verás: "✓ PDF processed successfully with AI - X transactions found"

6. **Revisa las transacciones**:
   - 📊 Las transacciones aparecen en la tabla de preview
   - ✏️ Puedes editar antes de importar
   - ✅ Haz clic en "Import" para confirmar

### Test 3: Verificar Logs

Si algo falla, revisa los logs:

```bash
# Logs de Mastra Dev
tail -f /tmp/mastra-dev.log

# Logs del servidor HTTP
tail -f /tmp/mastra-server.log
```

## 🔍 Troubleshooting

### Error: "PDF extraction failed"

**Causa**: El servidor PDF no está corriendo o no puede alcanzar Mastra

**Solución**:
```bash
# Verifica que ambos servicios estén activos
ps aux | grep mastra
ps aux | grep "tsx src/server"

# Reinicia los servicios
cd MASTRA-PDF-IMPORTER
./start-pdf-service.sh
```

### Error: "PDF_AGENT_HTTP_URL not configured"

**Causa**: Variable de entorno no configurada en Actual

**Solución**:
```bash
# Verifica que existe .env en la raíz de Actual
cat /Users/sebiropero_personal/sropero/Developer/personal-finance-actual_SR/.env

# Debe contener:
# PDF_AGENT_HTTP_URL=http://localhost:5055
```

### Error: "HTTP 500" al procesar PDF

**Causa**: Error en el agente Mastra (probablemente API key inválida o rate limit)

**Solución**:
```bash
# Verifica API key
cat MASTRA-PDF-IMPORTER/.env | grep OPENAI_API_KEY

# Revisa los logs detallados
tail -f /tmp/mastra-dev.log
```

### Transacciones no se extraen correctamente

**Causa**: El PDF tiene un formato diferente al esperado

**Solución**:
- Verifica que el PDF sea de Santander o Revolut España
- Los parsers están optimizados para estos formatos específicos
- Si es otro banco, necesitarás crear un parser nuevo en `src/mastra/tools/`

## 📝 Bancos Soportados

### ✅ Santander España
- Extractos de cuenta corriente
- Formato: PDF con patrón "FECHA OPERACIÓN → FECHA VALOR → DESCRIPCIÓN → IMPORTE → SALDO"

### ✅ Revolut
- Extractos en EUR, USD, GBP
- Formato: PDF con transacciones estructuradas por fecha

## 🎯 Próximos Pasos

### Mejoras Sugeridas

1. **Agregar más bancos**:
   - Crear parsers en `MASTRA-PDF-IMPORTER/src/mastra/tools/`
   - Agregar herramienta al agente en `pdf-extractor-agent.ts`

2. **Caché de resultados**:
   - Guardar PDFs procesados para no reprocesarlos
   - Usar la base de datos LibSQL configurada

3. **Validación mejorada**:
   - Comparar saldos inicial/final
   - Verificar suma de transacciones

4. **UI más rica**:
   - Preview del PDF antes de procesar
   - Progress bar durante extracción
   - Estadísticas de confianza del agente

## 🔧 Desarrollo

### Estructura del Código

```
MASTRA-PDF-IMPORTER/
├── src/
│   ├── mastra/
│   │   ├── agents/
│   │   │   └── pdf-extractor-agent.ts  # Agente principal
│   │   ├── tools/
│   │   │   ├── pdf-reader.ts           # Lee PDF → texto
│   │   │   ├── santander-parser-v2.ts  # Parser Santander
│   │   │   ├── revolut-parser.ts       # Parser Revolut
│   │   │   └── save-file.ts            # Guarda archivos
│   │   └── index.ts                     # Configuración Mastra
│   └── server.ts                        # Servidor HTTP wrapper
├── start-pdf-service.sh                 # Script de inicio
└── package.json

packages/loot-core/src/server/transactions/import/
├── parse-file.ts        # Detecta .pdf y llama a pdf-adapter
└── pdf-adapter.ts       # Adaptador HTTP → Mastra

packages/desktop-client/src/components/
└── modals/ImportTransactionsModal/
    └── ImportTransactionsModal.tsx  # UI de importación (actualizada)
```

### Agregar un Nuevo Parser de Banco

1. **Crear herramienta**:
```typescript
// src/mastra/tools/mi-banco-parser.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const miBancoParserTool = createTool({
  id: 'parse-mi-banco',
  description: 'Parsea transacciones de Mi Banco',
  inputSchema: z.object({
    text: z.string(),
  }),
  outputSchema: z.object({
    transactions: z.array(z.object({
      date: z.string(),
      amount: z.number(),
      description: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    const { text } = context;
    // Tu lógica de parsing aquí
    return { transactions: [...] };
  },
});
```

2. **Registrar en el agente**:
```typescript
// src/mastra/agents/pdf-extractor-agent.ts
import { miBancoParserTool } from '../tools/mi-banco-parser';

export const pdfExtractorAgent = new Agent({
  // ...
  tools: {
    saveFileTool,
    pdfReaderTool,
    santanderParserTool,
    revolutParserTool,
    miBancoParserTool, // ← Agregar aquí
  }
});
```

3. **Actualizar instrucciones**:
Edita las `instructions` del agente para incluir el nuevo banco.

## 📚 Recursos

- [Mastra Docs](https://mastra.ai/docs)
- [Actual Budget Docs](https://actualbudget.org/docs)
- [OpenAI API](https://platform.openai.com/docs)

## 🎉 ¡Listo!

Tu sistema de importación de PDFs con IA está completamente integrado y listo para usar.