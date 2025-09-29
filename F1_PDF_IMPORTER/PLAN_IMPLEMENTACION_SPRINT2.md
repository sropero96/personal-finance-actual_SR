# Plan de Implementación - Sprint 2: Data Curator Agent & Memoria por Usuario

## 🎯 Objetivo
Construir el **Agente 2 (Data Curator)** que recibe el JSON estructurado del Agente 1 (PDF Extractor), enriquece y normaliza las transacciones, sugiere *payee* y *categoría*, detecta duplicados y persiste memoria por usuario para mejorar con feedback.

> Este sprint trabaja el agente de forma **aislada** (input mock del Agente 1). La integración workflow + importador de Actual y la UI se desarrollarán en los siguientes sprints.

---
## 1. Alcance
**Incluye:** normalización, memoria por usuario, sugerencias básicas (reglas + lookup), detección de duplicados, contrato de salida preliminar, feedback loop inicial.

**Excluye (futuro):** embeddings/semántica avanzada, UI/UX, integración final con modal de importación, workflow completo, métricas avanzadas de calidad.

---
## 2. Contrato de Datos
### 2.1 Input (desde Agente 1 – versión Sprint 2)
```json
{
  "bankName": "Santander" | "Revolut",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "amount": number,
      "balance": number,
      "type": "debit" | "credit",
      "rawText": "string"
    }
  ],
  "totalTransactions": number,
  "success": true,
  "metaUser": { "userId": "string", "accountId": "string?" }
}
```

### 2.2 Output (pre‑importador Actual - preliminar)
```json
{
  "preparedTransactions": [
    {
      "id": "temp-uuid",
      "date": "YYYY-MM-DD",
      "payee": "string",
      "category": "string|null",
      "amount": number,
      "memo": "string?",
      "isDuplicate": false,
      "confidence": { "payee": 0.0, "category": 0.0, "duplicate": 0.0 },
      "source": { "bank": "Santander|Revolut", "rawDescription": "string" },
      "feedbackState": "pending" | "confirmed" | "corrected"
    }
  ],
  "summary": { "total": 0, "duplicates": 0, "autoApprovedCandidates": 0 },
  "metrics": { "withMemory": false, "avgPayeeConfidence": 0, "avgCategoryConfidence": 0, "duplicates": 0 }
}
```
> Formato puede ajustarse cuando validemos requisitos exactos del importador de Actual.

---
## 3. Arquitectura (Sprint 2)
```
MASTRA-PDF-IMPORTER/
  src/mastra/
    agents/
      data-curator-agent.ts
    tools/
      memory/
        user-memory-get.ts
        user-memory-upsert.ts
      normalization/
        normalize-transaction.ts
      enrichment/
        payee-suggester.ts
        category-suggester.ts
      quality/
        duplicate-detector.ts
        scoring.ts
    mocks/
      sample-agent1-output.json
    utils/
      string-normalization.ts
      hashing.ts
      fuzzy.ts
```

---
## 4. Tools (Definición Resumida)
| Tool | id | Propósito |
|------|----|-----------|
| user-memory-get | user-memory-get | Cargar memoria por usuario (mappings + correcciones) |
| user-memory-upsert | user-memory-upsert | Registrar feedback / correcciones |
| normalize-transaction | normalize-tx | Limpiar y estandarizar campos (signo, espacios, casing) |
| payee-suggester | suggest-payee | Inferir payee (lookup + fuzzy + fallback) |
| category-suggester | suggest-category | Inferir categoría (reglas + memoria + fallback) |
| duplicate-detector | detect-duplicate | Señalar posibles duplicados recientes |
| scoring | score-tx | Calcular score compuesto para autovalidación |

---
## 5. Memoria por Usuario
Archivo JSON: `data/memory/<userId>.json`
```json
{
  "payeeMap": { "rawKey": "Canonical Payee" },
  "categoryMap": { "rawKey|canonicalPayee": "Category" },
  "corrections": [ { "txHash": "hash", "newPayee": "X", "newCategory": "Y", "timestamp": 123456789 } ],
  "historyVersion": 1
}
```
Detección de inexistencia => modo bootstrap (no auto-aprobar).

### 5.1 Clave normalizada
`rawKey = lowerCase(trim(removeAccents(removeRefNumbers(description))))`

### 5.2 Hash transacción
`txHash = sha256(date + '|' + abs(amount).toFixed(2) + '|' + normalizedDescription.slice(0,60))`

---
## 6. Flujo Interno Agente 2
```
load userMemory
for tx in input.transactions:
  norm = normalize-tx(tx)
  payee = suggest-payee(norm.description, userMemory)
  category = suggest-category(norm.description, payee, userMemory)
  dup = detect-duplicate(userId, norm)
  score = score-tx(payee.conf, category.conf, 1 - dup.conf)
  build preparedTx
aggregate summary & metrics
return output
```

---
## 7. Prompt (Borrador)
Rol: especialista en curación financiera.
Instrucciones clave:
- Usar memoria antes de inventar.
- No crear categorías nuevas si confianza < 0.55 (devolver null).
- Mantener signos: egresos negativos, ingresos positivos.
- No eliminar transacciones marcadas duplicadas (solo flag).
- Preparar campos exactamente según contrato.

 ---

## 8. Estrategia de Sugerencias
 
**Payee:** exact lookup → fuzzy (≥0.85) → reglas keywords → fallback "Unknown" (sin LLM aún).

**Categoría:** lookup (payee+rawKey) → reglas keyword → fallback null.

Reglas ejemplo:

- "uber" -> Transport
- "mercadona" / "carrefour" / "dia" -> Groceries
- "amazon" -> Shopping
- "spotify" -> Subscriptions

---

## 9. Duplicados

Criterio base:

- abs(amount diff) ≤ 0.01
- fecha igual o ±1 día
- similitud descripción >= 0.8 (1 - distancia normalizada)

Confianza = (monto 0.5 + fecha 0.3 + descripción 0.2)

Fuente de comparación (Sprint 2): mock `data/history/<userId>-recent.json`.

---

## 10. Feedback Loop

### Input esperado (futuro endpoint / script)

```json
{
  "userId": "u1",
  "txId": "temp-uuid",
  "newPayee": "Supermercado DIA",
  "newCategory": "Groceries"
}
```

Proceso: generar txHash → actualizar payeeMap/categoryMap → guardar en corrections.

---

## 11. Scoring

`composite = (payeeConf * 0.4) + (categoryConf * 0.4) + ((1 - duplicateConf) * 0.2)`

Umbrales (propuesta):

- autoApprovedCandidates: composite ≥ 0.78 y sin duplicate
- pendiente: 0.45–0.77
- revisión requerida: < 0.45

---

## 12. Tareas Técnicas (Orden)

1. Mock de input (`sample-agent1-output.json`)
2. Utilidades: normalización / hashing / fuzzy
3. Implementar memoria (get/upsert)
4. Tool normalize-tx
5. Duplicate store mock + detector
6. Payee suggester (lookup + fuzzy + reglas)
7. Category suggester (lookup + reglas)
8. Scoring tool
9. Agente `data-curator-agent.ts` (prompt v1 + orquestación)
10. Script prueba `scripts/test-data-curator.ts`
11. Tool feedback (upsert memoria)
12. Re-ejecución tras feedback y validar mejora
13. Documentar contrato final

---

## 13. Casos de Test

| Caso | Objetivo |
|------|----------|
| Sin memoria inicial | Retorna payees "Unknown" o reglas básicas |
| Con feedback aplicado | Sugerencias cambian acorde a correcciones |
| Duplicado detectado | Flag isDuplicate = true |
| Variantes descripción similar | Unifica payee |
| Categoría no reconocida | Devuelve null + baja confianza |

---

## 14. Métricas Sprint 2

```json
{
  "withMemory": true,
  "avgPayeeConfidence": 0.0,
  "avgCategoryConfidence": 0.0,
  "duplicates": 0
}
```

---

## 15. Riesgos & Mitigación

| Riesgo | Mitigación |
|--------|------------|
| Formato importador difiere | Validar temprano archivos importers en repo Actual |
| Memoria crece sin control | Pruning futuro / límite tamaño archivo |
| Fuzzy costoso | Acotar a set payees únicos y cache |
| Feedback masivo manual | Batch tool futuro |

---

## 16. Timeline

| Día | Actividad |
|-----|-----------|
| 1 | Memoria + utils + mock |
| 2 | Sugerencias payee/category + duplicados |
| 3 | Agente + scoring + pruebas |
| 4 | Feedback loop + re-test |
| 5 | Pulido contrato + docs |

---

## 17. Entregables

- Agente 2 operativo en aislamiento
- Tools memoria, normalización, enriquecimiento y duplicados
- Script de prueba y ejemplo antes/después feedback
- Contrato JSON estable para integración posterior
- Documentación Sprint 2 (este archivo)

---

## 18. Próximo Paso

Implementar: memoria + normalización + mock de input para primera ejecución en frío.
