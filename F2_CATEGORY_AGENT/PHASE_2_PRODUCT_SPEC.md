# Fase 2: Agente de Categorización Inteligente

## Product Specification & Design Document

**Versión:** 2.0  
**Fecha:** Octubre 2025  
**Autor:** Sebastian Ropero  
**Estado:** 🎯 Planning - Ready for Implementation

---

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Contexto y Motivación](#contexto-y-motivación)
3. [Problema a Resolver](#problema-a-resolver)
4. [Solución Propuesta](#solución-propuesta)
5. [Arquitectura del Sistema](#arquitectura-del-sistema)
6. [Diseño de UX](#diseño-de-ux)
7. [Estrategia de Búsqueda](#estrategia-de-búsqueda)
8. [Prompt Engineering](#prompt-engineering)
9. [Implementación por Fases](#implementación-por-fases)
10. [Riesgos y Mitigaciones](#riesgos-y-mitigaciones)
11. [Métricas de Éxito](#métricas-de-éxito)

---

## 🎯 Resumen Ejecutivo

### ¿Qué se va a construir?

Un **segundo agente AI especializado** que sugiere categorías para transacciones bancarias importadas, aprendiendo del historial del usuario y respetando sus reglas de categorización existentes.

### Problema que resuelve

**Situación actual (Post-Fase 1):**

- ✅ Agente 1 extrae 10-100 transacciones de PDFs
- ✅ Cura nombres de payees inteligentemente
- ❌ **NO sugiere categorías** (feature removida porque no funcionaba)

**Por qué NO funciona actualmente:**

```
Agente 1 sugería: \"Restaurant\" (en inglés, genérico)
Usuario tiene:      \"Restaurantes\" (en español, personalizado)
Resultado:          No match → categoría vacía ❌
```

**Nueva solución (Fase 2):**

```
Agente 2 ve:        \"La Mina, Madrid\" en transacción nueva
Busca en historial: \"La Mina\" → 5 veces categorizado como \"Restaurantes\"
Sugiere:            \"Restaurantes\" (categoría REAL del usuario) ✅
Confianza:          92% (basado en histórico)
```

### Impacto esperado

- ⏱️ **Ahorro de tiempo**: De 5 minutos categorizando 50 transacciones a 30 segundos revisando sugerencias
- 🎯 **Precisión**: >85% de categorías correctas (meta inicial)
- 🧠 **Aprendizaje**: Mejora con cada importación del usuario
- 🎨 **UX**: Opt-in, transparente, con reasoning visible

---

## 🔍 Contexto y Motivación

### Estado Actual del Sistema

**Deployment en producción:**

- **actual-budget-sr.fly.dev** - Aplicación Actual Budget (297 MB)
- **actual-agent-sr.fly.dev** - Agente 1 de parseo PDF (76 MB)

**Flujo actual (Fase 1):**

```
1. Usuario sube PDF
2. Agente 1 extrae transacciones
3. Cura payees
4. Usuario las importa
5. ❌ Usuario categoriza manualmente 1 por 1
```

**Flujo propuesto (Fase 2):**

```
1. Usuario sube PDF
2. Agente 1 extrae transacciones
3. Cura payees
4. ✨ Usuario hace click \"Sugerir Categorías\"
5. Agente 2 analiza histórico → sugiere categorías
6. Usuario revisa sugerencias (acepta/modifica)
7. Usuario importa (80% ya categorizadas)
```

### Lecciones de Fase 1

#### ❌ Lo que NO funcionó

```javascript
// Agente 1 sugería categorías genéricas en inglés
{
  \"category\": \"Restaurant\",  // ❌ No existe en BD del usuario
  \"confidence\": 0.95         // ❌ Alta confianza en dato incorrecto
}
```

**Root cause:**

- El agente NO conocía las categorías del usuario
- Inventaba nombres genéricos
- No había contexto histórico

#### ✅ Lo que SÍ funcionó

```javascript
// Curación de payees fue exitosa
{
  \"payee\": \"La Mina, Madrid\",  // ✅ Limpio y útil
  \"notes\": \"Pago Movil En La Mina, Madrid\"  // ✅ Contexto preservado
}
```

**Key insight:**

- Funcionó porque el agente procesaba SOLO el PDF (información completa)
- Falló en categorías porque necesitaba CONTEXTO EXTERNO (base de datos del usuario)

---

## 🚫 Problema a Resolver

### Problema Principal

**Las categorías son personales y únicas por usuario:**

Usuario A (España):

```
- Restaurantes
- Transporte público
- Supermercado Mercadona
```

Usuario B (México):

```
- Comida fuera
- Uber/transporte
- Despensa
```

Usuario C (Freelancer):

```
- Meals - Deductible
- Travel - Business
- Groceries - Personal
```

**No existe una lista \"universal\" de categorías.**

### Desafíos Técnicos

#### 1. Acceso a Base de Datos

```
PREGUNTA: ¿Cómo accede el Agente 2 a la BD SQLite del usuario?
OPCIONES:
  a) Direct SQLite access
  b) API endpoint de Actual Budget
  c) MCP SQL Server
```

#### 2. Búsqueda Eficiente

```
PREGUNTA: ¿Cómo encontrar transacciones similares en 10,000 transacciones?
OPCIONES:
  a) SQL LIKE queries (simple, rápido)
  b) Fuzzy matching (Levenshtein)
  c) Embeddings + vector search (complejo, caro)
```

#### 3. Aprendizaje de Reglas

```
PREGUNTA: ¿Cómo combinar reglas explícitas + inferencia histórica?
OPCIONES:
  a) Reglas primero, histórico segundo
  b) Scoring híbrido (reglas 70% + histórico 30%)
  c) Claude decide con todo el contexto
```

---

## 💡 Solución Propuesta

### Principios de Diseño (No Negociables)

#### 1. **Separación de Responsabilidades**

```
Agente 1: PDF → Transacciones + Payee curado
Agente 2: Transacciones → Sugerencias de categoría

❌ NO mezclar en un solo agente
✅ Debuggear independientemente
```

#### 2. **User Control (UX-first)**

```
✅ Botón explícito \"Sugerir Categorías\" (opt-in)
✅ Usuario revisa ANTES de importar
✅ Puede editar/ignorar sugerencias
✅ Transparencia: mostrar reasoning
```

#### 3. **Pragmatismo sobre Perfección**

```
Fase MVP:
  - SQL simple + string matching
  - Sin embeddings (añadir complejidad)
  - Sin ML custom (usar Claude)

Fase 2 (futuro):
  - Vectorización si es necesario
  - Feedback loop para aprender
```

### Arquitectura de Agentes

```
┌────────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                       │
│                                                             │
│  ImportTransactionsModal.tsx                                │
│  ┌──────────────────────────────────────────┐              │
│  │ 1. Upload PDF                             │              │
│  │ 2. Show transactions (without category)   │              │
│  │ 3. [Sugerir Categorías] button visible   │ ← NEW!       │
│  │ 4. On click → call Agente 2               │              │
│  │ 5. Update UI with suggestions             │              │
│  │ 6. User reviews → Import                  │              │
│  └──────────────────────────────────────────┘              │
└────────────────────┬───────────────────────────────────────┘
                     │
                     │ POST /api/process-pdf
                     ▼
┌────────────────────────────────────────────────────────────┐
│               AGENTE 1: PDF Parser                          │
│          actual-agent-sr.fly.dev                            │
│                                                             │
│  Input:  PDF file                                           │
│  Output: { transactions: [...], payees curated }            │
│  Status: ✅ PRODUCTION - NO MODIFICAR                       │
└─────────────────────────────────────────────────────────────┘

                     │
                     │ POST /api/suggest-categories  ← NEW!
                     ▼
┌────────────────────────────────────────────────────────────┐
│           AGENTE 2: Category Suggester                      │
│       actual-agent-sr.fly.dev (same server)                 │
│                                                             │
│  Input:  { transactions: [...], userId/accountId }          │
│  Process:                                                    │
│    1. Query SQLite → user categories                        │
│    2. Query SQLite → similar transactions                   │
│    3. Query SQLite → active rules                           │
│    4. Call Claude with context                              │
│    5. Return suggestions                                    │
│  Output: { transactions: [...], category, confidence }      │
│  Status: 🔨 TO IMPLEMENT                                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ SQL Queries
                     ▼
┌────────────────────────────────────────────────────────────┐
│              ACTUAL BUDGET DATABASE                         │
│                  (SQLite)                                   │
│                                                             │
│  Tables:                                                    │
│  - transactions (historical data)                           │
│  - categories (user's categories)                           │
│  - rules (auto-categorization rules)                        │
│  - payees (known payees)                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Arquitectura del Sistema

### Decisión 1: ¿Dónde vive el Agente 2?

#### ✅ Opción Elegida: Mismo Servidor (actual-agent-sr)

**Estructura:**

```
actual-agent-sr.fly.dev
├── POST /api/process-pdf         → Agente 1 (existente)
└── POST /api/suggest-categories  → Agente 2 (nuevo)
```

**Pros:**

- ✅ Simplicidad de deployment (1 servidor)
- ✅ Shared dependencies (@anthropic-ai/sdk)
- ✅ Shared environment variables (API key)
- ✅ Menor costo de hosting
- ✅ Logging unificado

**Cons:**

- ⚠️ Acoplamiento en el mismo codebase
- ⚠️ No escalado independiente (no crítico para MVP)

**Alternativas consideradas:**

```
B) Servidores separados
   actual-agent-sr.fly.dev       (Agente 1)
   actual-categorizer-sr.fly.dev (Agente 2)
   → Rechazado: Overkill para MVP, añade complejidad sin beneficio claro

C) Serverless (Fly Machines)
   → Rechazado: Cold starts afectan UX, complejidad de BD access
```

### Decisión 2: ¿Cómo accede a la Base de Datos?

#### ✅ Opción Elegida: API Endpoint de Actual Budget

**Implementación:**

```
Actual Budget (sync-server) expone:
  GET /api/categories/:accountId
  GET /api/transactions/search
  GET /api/rules/:accountId

Agente 2 hace fetch() a estos endpoints
```

**Pros:**

- ✅ Sin acceso directo a SQLite (más seguro)
- ✅ Actual ya tiene la lógica de queries
- ✅ Respeta permisos y multi-tenancy
- ✅ Puede cachear en Actual
- ✅ Fácil de testear

**Cons:**

- ⚠️ Latencia de HTTP round-trip extra
- ⚠️ Requiere modificar sync-server

**Alternativas consideradas:**

```
A) Direct SQLite Access
   → Rechazado: Riesgo de corrupción, difícil multi-tenancy, no portable

C) MCP SQL Server
   → Rechazado: Overkill para un solo use case, añade dependencia externa
```

### Decisión 3: ¿Búsqueda exacta o fuzzy matching?

#### ✅ Opción Elegida: SQL Simple + Fuzzy matching como fallback

**Implementación:**

```sql
-- Paso 1: Búsqueda exacta (rápida)
SELECT * FROM transactions
WHERE payee = 'La Mina, Madrid'
  AND category IS NOT NULL
ORDER BY date DESC
LIMIT 10;

-- Paso 2: Búsqueda fuzzy (si paso 1 devuelve <3 resultados)
SELECT * FROM transactions
WHERE payee LIKE '%La Mina%'
  AND category IS NOT NULL
ORDER BY date DESC
LIMIT 20;

-- Paso 3: Fuzzy más agresivo (si aún insuficiente)
-- Usar Levenshtein distance en JavaScript
```

**Pros:**

- ✅ Rápido para casos comunes (80% de payees repetidos)
- ✅ No requiere embeddings ni vector DB
- ✅ Simple de implementar y debuggear
- ✅ Costo $0 (no APIs externas)

**Cons:**

- ⚠️ No captura sinónimos (\"Mercadona\" vs \"Supermercado\")
- ⚠️ Sensible a typos en payee original

**Alternativas consideradas:**

```
B) Vectorización + Embeddings
   → Rechazado para MVP:
     - Añade complejidad (vector DB, embeddings API)
     - Costo extra (OpenAI/Cohere embeddings)
     - Latencia adicional
     - Puede ser Fase 3 si accuracy <85%

C) Full-text search SQLite
   → Considerado: FTS5 de SQLite es viable
   → Requiere recrear índices → más complejidad para MVP
```

---

## 🎨 Diseño de UX

### Flujo Actual (Fase 1) - NO CAMBIA

```
┌────────────────────────────────────────┐
│ Import transactions (PDF)              │
├────────────────────────────────────────┤
│                                        │
│ ✅ 51 transactions found               │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ Date     Payee    Notes   Category│  │
│ │ 2025-07-17 La Mina... Pago...  [ ]│  │
│ │ 2025-07-18 Metro... Trans... [ ]│  │
│ │ ...                              │  │
│ └──────────────────────────────────┘  │
│                                        │
│              [Import]  [Cancel]        │
└────────────────────────────────────────┘
```

### Flujo Propuesto (Fase 2) - NUEVO

```
┌────────────────────────────────────────┐
│ Import transactions (PDF)              │
├────────────────────────────────────────┤
│                                        │
│ ✅ 51 transactions found               │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ Date     Payee    Notes   Category│  │
│ │ 2025-07-17 La Mina... Pago...  [ ]│  │
│ │ 2025-07-18 Metro... Trans... [ ]│  │
│ │ ...                              │  │
│ └──────────────────────────────────┘  │
│                                        │
│    ✨ [Sugerir Categorías con AI] ← NEW│
│                                        │
│              [Import]  [Cancel]        │
└────────────────────────────────────────┘

Usuario hace click ↓

┌────────────────────────────────────────┐
│ Import transactions (PDF)              │
├────────────────────────────────────────┤
│                                        │
│ 🤖 Analizando histórico... (spinner)   │ ← Loading
│                                        │
└────────────────────────────────────────┘

Después de 2-5 segundos ↓

┌────────────────────────────────────────┐
│ Import transactions (PDF)              │
├────────────────────────────────────────┤
│                                        │
│ ✅ 51 transactions found               │
│ 🤖 43 categorías sugeridas             │ ← Feedback
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ Date     Payee    Notes   Category│  │
│ │ 2025-07-17 La Mina... Pago...     │  │
│ │   🤖 Restaurantes (92%) ←NUEVO    │  │ ← Sugerencia + confianza
│ │   ℹ️  Similar a 5 transacciones   │  │ ← Reasoning
│ │                                   │  │
│ │ 2025-07-18 Metro... Trans...      │  │
│ │   🤖 Transporte (98%)             │  │
│ │   ℹ️  Coincide con regla activa   │  │
│ │ ...                               │  │
│ └──────────────────────────────────┘  │
│                                        │
│              [Import]  [Cancel]        │
└────────────────────────────────────────┘
```

### UI Components

#### 1. Botón \"Sugerir Categorías\"

```typescript
// En ImportTransactionsModal.tsx
<Button
  variant=\"primary\"
  onPress={handleSuggestCategories}
  isDisabled={transactions.length === 0 || isLoadingCategories}
>
  <Stack direction=\"row\" align=\"center\" spacing={1}>
    <SparklesIcon size={16} /> {/* Icon sugerente de AI */}
    <Text>Sugerir Categorías con AI</Text>
  </Stack>
</Button>
```

**Ubicación:** Debajo de la tabla de transacciones, arriba del botón \"Import\"

#### 2. Estado de Loading

```typescript
{isLoadingCategories && (
  <View style={{ alignItems: 'center', padding: 20 }}>
    <Spinner />
    <Text style={{ marginTop: 10 }}>
      Analizando tu histórico de transacciones...
    </Text>
  </View>
)}
```

#### 3. Visualización de Sugerencia

```typescript
// Cada transacción con sugerencia muestra:
<View style={{ paddingLeft: 20, marginTop: 5 }}>
  <Stack direction=\"row\" align=\"center\" spacing={1}>
    <RobotIcon size={14} />
    <Text style={{ fontWeight: 'bold' }}>
      {suggestion.category}
    </Text>
    <Badge variant=\"success\">
      {Math.round(suggestion.confidence * 100)}%
    </Badge>
  </Stack>
  <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
    ℹ️  {suggestion.reasoning}
  </Text>
</View>
```

#### 4. Edición de Sugerencias

```typescript
// Usuario puede:
// 1. Aceptar sugerencia (por defecto, ya visible)
// 2. Editar manualmente (click en dropdown de categoría)
// 3. Ignorar (dejar vacío)
```

### Estados de Confianza

**Color coding:**

```typescript
const getConfidenceBadge = (confidence: number) => {
  if (confidence >= 0.9) return { color: 'success', text: 'Alta' };
  if (confidence >= 0.75) return { color: 'warning', text: 'Media' };
  return { color: 'error', text: 'Baja' };
};
```

**Ejemplos de reasoning:**

```
92% - \"Similar a 'La Mina' (5 transacciones previas → Restaurantes)\"
98% - \"Coincide con regla: Payee contiene 'Metro' → Transporte\"
65% - \"Inferido de transacciones similares (solo 2 coincidencias)\"
```

---

## 🔍 Estrategia de Búsqueda

### Algoritmo de Similarity Search

```javascript
/**
 * Find similar transactions for a given payee
 * Strategy: Fast exact match → Fuzzy fallback
 */
async function findSimilarTransactions(payee, accountId, minMatches = 3) {
  // STEP 1: Exact match (fastest)
  let matches = await querySQLite(
    `
    SELECT payee, category, COUNT(*) as frequency, MAX(date) as last_used
    FROM transactions
    WHERE payee = ? 
      AND account = ?
      AND category IS NOT NULL
    GROUP BY category
    ORDER BY frequency DESC, last_used DESC
    LIMIT 10
  `,
    [payee, accountId],
  );

  if (matches.length >= minMatches) {
    return matches;
  }

  // STEP 2: Fuzzy match with LIKE (good enough for 90% cases)
  const payeeKeywords = extractKeywords(payee); // \"La Mina, Madrid\" → [\"La\", \"Mina\"]

  for (const keyword of payeeKeywords) {
    const fuzzyMatches = await querySQLite(
      `
      SELECT payee, category, COUNT(*) as frequency, MAX(date) as last_used
      FROM transactions
      WHERE payee LIKE ?
        AND account = ?
        AND category IS NOT NULL
      GROUP BY category
      ORDER BY frequency DESC, last_used DESC
      LIMIT 20
    `,
      [`%${keyword}%`, accountId],
    );

    matches = [...matches, ...fuzzyMatches];

    if (matches.length >= minMatches) {
      return deduplicateAndSort(matches);
    }
  }

  // STEP 3: Levenshtein distance (if still not enough)
  if (matches.length < minMatches) {
    const allPayees = await querySQLite(
      `
      SELECT DISTINCT payee, category, MAX(date) as last_used
      FROM transactions
      WHERE account = ? AND category IS NOT NULL
      ORDER BY last_used DESC
      LIMIT 500
    `,
      [accountId],
    );

    const levenshteinMatches = allPayees
      .map(tx => ({
        ...tx,
        distance: levenshtein(payee, tx.payee),
      }))
      .filter(tx => tx.distance <= 5) // Max 5 character differences
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    matches = [...matches, ...levenshteinMatches];
  }

  return deduplicateAndSort(matches);
}
```

### Optimizaciones de Performance

#### Índices Recomendados

```sql
-- Índice para búsqueda rápida por payee
CREATE INDEX IF NOT EXISTS idx_transactions_payee_category
ON transactions(account, payee, category, date);

-- Índice para búsqueda histórica
CREATE INDEX IF NOT EXISTS idx_transactions_account_date
ON transactions(account, date DESC);
```

#### Caching Strategy

```javascript
// Cache in-memory para sesión de import
const categoryCache = new Map(); // payee → { category, confidence, reasoning }

function getCachedOrQuery(payee, accountId) {
  const key = `${accountId}:${payee}`;

  if (categoryCache.has(key)) {
    return categoryCache.get(key);
  }

  const result = await findSimilarTransactions(payee, accountId);
  categoryCache.set(key, result);

  return result;
}
```

**Beneficios:**

- ✅ Payees repetidos en el mismo PDF (común: Uber x3, Mercadona x5)
- ✅ Reduce llamadas a BD de 50 a ~15 por import
- ✅ Cache se limpia al cerrar modal (no persistente)

---

## 🧠 Prompt Engineering

### Estructura del Prompt del Agente 2

```javascript
const categorizationPrompt = `You are a transaction categorization expert for Actual Budget.

I will provide you with:
1. A transaction that needs categorization
2. The user's available categories (their personal list)
3. Similar historical transactions with categories assigned
4. Active categorization rules

Your task is to suggest the BEST category from the user's list.

## USER'S CATEGORIES
${JSON.stringify(userCategories, null, 2)}

## TRANSACTION TO CATEGORIZE
${JSON.stringify(transaction, null, 2)}

## HISTORICAL CONTEXT
${JSON.stringify(similarTransactions, null, 2)}

## ACTIVE RULES
${JSON.stringify(activeRules, null, 2)}

## INSTRUCTIONS

1. **ONLY suggest categories that exist in USER'S CATEGORIES** (never invent new ones)
2. **Prioritize rules** - If a rule matches, use it (high confidence)
3. **Learn from history** - If payee appears in historical transactions, use most frequent category
4. **Reason clearly** - Explain your decision
5. **Be honest about confidence** - If unsure, say so (confidence < 0.7)

Return ONLY a JSON object (no markdown, no code blocks):

{
  \"category\": \"Restaurantes\",
  \"confidence\": 0.92,
  \"reasoning\": \"Payee 'La Mina' appears in 5 historical transactions, all categorized as 'Restaurantes'\"
}

If you cannot suggest a category with confidence >= 0.5, return:
{
  \"category\": null,
  \"confidence\": 0,
  \"reasoning\": \"No similar transactions or rules found for this payee\"
}
`;
```

### Optimización de Context

**Problema:** Con 50 transacciones, el context crece mucho.

**Solución:** Procesamiento por lotes

```javascript
// Dividir en batches de 10 transacciones
const BATCH_SIZE = 10;

async function suggestCategoriesInBatches(transactions) {
  const results = [];

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);

    // Llamar Claude con el batch
    const batchResults = await callClaude({
      transactions: batch,
      userCategories,
      // ... shared context
    });

    results.push(...batchResults);
  }

  return results;
}
```

**Alternativa:** Pre-procesamiento antes de Claude

```javascript
// Preparar contexto UNA VEZ para todas las transacciones
const sharedContext = {
  userCategories: await fetchUserCategories(accountId),
  activeRules: await fetchActiveRules(accountId),
};

// Para cada transacción, solo buscar SU contexto específico
for (const tx of transactions) {
  const similarTx = await findSimilarTransactions(tx.payee, accountId);

  const suggestion = await callClaude({
    transaction: tx,
    ...sharedContext,
    similarTransactions: similarTx.slice(0, 5), // Top 5 only
  });

  tx.category = suggestion.category;
  tx.categoryConfidence = suggestion.confidence;
  tx.categoryReasoning = suggestion.reasoning;
}
```

---

## 📦 Implementación por Fases

### MVP (Minimum Viable Product) - 2 semanas

**Scope:**

```
✅ Agente 2 endpoint: POST /api/suggest-categories
✅ SQL queries para categorías, histórico, reglas
✅ Algoritmo de búsqueda simple (exact + LIKE)
✅ Integración con Claude API
✅ UI: Botón \"Sugerir Categorías\"
✅ UI: Mostrar sugerencias con confianza
✅ Testing con 10-20 transacciones
```

**Fuera de scope:**

```
❌ Vectorización / embeddings
❌ Feedback loop (usuario corrige → re-entrenar)
❌ Caching persistente
❌ Analytics / métricas
```

**Criterios de éxito:**

- ✅ Accuracy > 70% en transacciones de payees conocidos
- ✅ Latencia < 5 segundos para 50 transacciones
- ✅ Sin errores de servidor

### Fase 2.1 (Post-MVP) - 1 semana

**Mejoras de accuracy:**

```
✅ Levenshtein distance para fuzzy matching
✅ Mejor extracción de keywords de payee
✅ Priorización de reglas sobre histórico
✅ Confidence scoring más refinado
```

### Fase 2.2 (Futuro) - TBD

**Features avanzadas:**

```
✅ Feedback loop: Usuario corrige → guardar corrección
✅ Analytics: Track accuracy, user acceptance rate
✅ Auto-crear reglas basadas en correcciones frecuentes
✅ Vectorización si accuracy no alcanza 85%
```

---

## ⚠️ Riesgos y Mitigaciones

### Riesgo 1: Latencia Alta (>10 segundos)

**Problema:** 50 transacciones x 1 query Claude cada una = 50 llamadas API = 30-60 segundos

**Mitigación:**

```javascript
// SOLUCIÓN 1: Batch processing
// Agrupar transacciones con mismo payee
const groupedByPayee = groupBy(transactions, 'payee');

for (const [payee, txs] of groupedByPayee) {
  const suggestion = await getSuggestion(payee); // 1 llamada para N txs
  txs.forEach(tx => (tx.category = suggestion.category));
}

// SOLUCIÓN 2: Pre-categorization con SQL
// El 60-80% de transacciones son payees conocidos
const knownPayees = await querySQLite(`
  SELECT payee, category, COUNT(*) as freq
  FROM transactions
  WHERE account = ? AND category IS NOT NULL
  GROUP BY payee, category
  HAVING freq >= 3
  ORDER BY freq DESC
`);

// Aplicar categorías de payees conocidos SIN llamar Claude
const knownMap = new Map(knownPayees.map(p => [p.payee, p.category]));

transactions.forEach(tx => {
  if (knownMap.has(tx.payee)) {
    tx.category = knownMap.get(tx.payee);
    tx.confidence = 0.95;
    tx.reasoning = `Auto-categorizado: payee conocido (${freq} veces)`;
  }
});

// Solo llamar Claude para payees nuevos/ambiguos
const unknownTxs = transactions.filter(tx => !tx.category);
// unknownTxs.length = 5-10 en vez de 50 ✅
```

### Riesgo 2: Accuracy Baja (<70%)

**Problema:** Sugerencias incorrectas frustran al usuario

**Mitigación:**

```javascript
// SOLUCIÓN 1: Threshold de confianza
if (suggestion.confidence < 0.7) {
  // No mostrar sugerencia (dejar vacío)
  tx.category = null;
  tx.showLowConfidenceWarning = true;
}

// SOLUCIÓN 2: Mostrar Top 3 sugerencias (no solo 1)
const topCategories = [
  { category: 'Restaurantes', confidence: 0.85 },
  { category: 'Entretenimiento', confidence: 0.65 },
  { category: 'Compras', confidence: 0.45 }
];

// UI: Dropdown con top 3
<Select>
  <Option value=\"Restaurantes\">🤖 Restaurantes (85%)</Option>
  <Option value=\"Entretenimiento\">Entretenimiento (65%)</Option>
  <Option value=\"Compras\">Compras (45%)</Option>
  <Option value=\"\">-- Sin categoría --</Option>
</Select>
```

### Riesgo 3: Base de Datos Vacía (Usuario Nuevo)

**Problema:** Sin histórico, no hay de dónde aprender

**Mitigación:**

```javascript
// SOLUCIÓN 1: Fallback a categorías genéricas
const DEFAULT_MAPPING = {
  'restaurante|comida|café': 'Restaurantes',
  'uber|taxi|metro|bus': 'Transporte',
  'mercado|super|tienda': 'Compras',
  // ...
};

// Si no hay histórico, usar mapping genérico
if (historicalTransactions.length === 0) {
  const suggestion = matchDefaultMapping(tx.payee);
  if (suggestion) {
    tx.category = suggestion;
    tx.confidence = 0.6; // Baja confianza
    tx.reasoning = 'Sugerencia basada en categorías comunes (sin histórico)';
  }
}

// SOLUCIÓN 2: Onboarding
// En primera importación, ofrecer \"Import con categorías de ejemplo\"
// Pre-poblar con ~20 categorías españolas comunes
```

### Riesgo 4: Multi-Tenancy / Seguridad

**Problema:** Agente 2 accede a BD de todos los usuarios

**Mitigación:**

```javascript
// SOLUCIÓN: Validar accountId en CADA request
app.post('/api/suggest-categories', async (req, res) => {
  const { transactions, accountId, userId } = req.body;

  // Validar que el userId tiene acceso al accountId
  const hasAccess = await validateUserAccess(userId, accountId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Queries siempre filtradas por accountId
  const categories = await db.query(
    `
    SELECT * FROM categories 
    WHERE account_id = ?
  `,
    [accountId],
  ); // ✅ Siempre filtrado

  // ...
});
```

---

## 📊 Métricas de Éxito

### Métricas de Producto

```javascript
// 1. Adoption Rate
const adoptionRate = (usersClickedSuggest / totalImports) * 100;
// Target: >60% de usuarios hacen click en \"Sugerir Categorías\"

// 2. Acceptance Rate
const acceptanceRate = (categoriesSuggested / categoriesAccepted) * 100;
// Target: >75% de sugerencias aceptadas sin modificación

// 3. Time Saved
const manualCategorizationTime = 50 * 6; // 50 txs x 6 seg cada una = 300 seg
const aiAssistedTime = 5 + 10 * 3; // 5 seg AI + 10 correcciones x 3 seg = 35 seg
const timeSaved = manualCategorizationTime - aiAssistedTime; // 265 seg = 4.4 min
// Target: >70% reducción de tiempo
```

### Métricas Técnicas

```javascript
// 1. Accuracy
const accuracy = (correctSuggestions / totalSuggestions) * 100;
// Target: >85% en transacciones de payees conocidos
// Target: >70% en transacciones de payees nuevos

// 2. Latency
const p50Latency = median(responseTimesPerTransaction);
const p95Latency = percentile95(responseTimesPerTransaction);
// Target: p50 < 100ms, p95 < 500ms (por transacción)
// Total: <5 segundos para 50 transacciones

// 3. API Costs
const costPerImport = tokensUsed * CLAUDE_PRICE_PER_TOKEN;
// Target: <$0.05 por import de 50 transacciones
```

### Dashboard de Métricas

```javascript
// Actual Budget → Settings → Import Stats
{
  \"totalImports\": 156,
  \"aiAssistedImports\": 94,  // 60% adoption
  \"categoriesSuggested\": 2340,
  \"categoriesAccepted\": 1755,  // 75% acceptance
  \"avgConfidence\": 0.87,
  \"avgLatency\": 3.2,  // seconds
  \"costToDate\": 4.68  // dollars
}
```

---

## 🎯 Próximos Pasos

### Para el Desarrollador

1. **Leer el documento técnico:**

   - `PHASE_2_TECHNICAL_PLAN.md` - Guía de implementación detallada

2. **Setup del entorno:**

   ```bash
   # Verificar API key de Anthropic
   echo $VITE_ANTHROPIC_API_KEY

   # Arrancar Agent Server
   cd anthropic-pdf-agent
   yarn dev

   # Arrancar Actual Budget
   yarn start:browser
   ```

3. **Orden de implementación:**

   ```
   Día 1-2:   API endpoints en sync-server (categories, search, rules)
   Día 3-4:   Endpoint /api/suggest-categories en agent server
   Día 5-6:   Algoritmo de búsqueda (SQL + fuzzy)
   Día 7-8:   Integración con Claude (prompt + parsing)
   Día 9-10:  UI: Botón + loading + mostrar sugerencias
   Día 11-12: Testing + ajustes de accuracy
   Día 13-14: Deployment a producción
   ```

4. **Testing checklist:**
   ```
   ✅ Caso 1: Usuario con 100+ transacciones históricas (happy path)
   ✅ Caso 2: Usuario nuevo sin histórico (fallback logic)
   ✅ Caso 3: 50 transacciones todas del mismo payee (cache test)
   ✅ Caso 4: Payees con typos (fuzzy matching test)
   ✅ Caso 5: Reglas activas que deben tener prioridad
   ✅ Caso 6: Latencia con mock de 100 transacciones
   ```

---

## 📚 Referencias

- [Actual Budget Repository](https://github.com/actualbudget/actual)
- [Anthropic Claude API Docs](https://docs.anthropic.com/)
- [SQLite Full-Text Search](https://www.sqlite.org/fts5.html)
- [Levenshtein Distance Algorithm](https://en.wikipedia.org/wiki/Levenshtein_distance)

---

**Documento generado:** Octubre 2025  
**Próxima revisión:** Post-implementación MVP  
**Contacto:** sebastian.ropero96@gmail.com
