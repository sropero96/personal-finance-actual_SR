# Mastra PDF Importer & Data Curator

Pipeline experimental para:

* Extraer texto/operaciones bancarias desde PDFs (agente extractor)
* Normalizar y enriquecer transacciones (agente curator)
* Persistir memoria de usuario (payees / categorías corregidas)
* Calcular métricas y detectar duplicados

## Componentes principales

* `pdf-extractor-agent`: Orquesta herramientas de parsing por banco.
* `data-curator-agent`: Normaliza, sugiere payee/categoría, detecta duplicados, puntúa y genera métricas.
* Tools clave:
  * `normalize-transaction`
  * `payee-suggester` (secondary key: descripción normalizada + bucket de importe redondeado)
  * `category-suggester`
  * `duplicate-detector` (tolerancia fecha ±1 día y importe ±2%)
  * `tx-scoring`
  * `user-memory-get` / `user-memory-upsert`
  * `curation-metrics`

## Scripts

```bash
yarn workspace mastra-pdf-importer run dev            # entorno mastra playground
yarn workspace mastra-pdf-importer run demo:curation  # demo pipeline (stub)
yarn workspace mastra-pdf-importer run demo:feedback  # aplica feedback a memoria
yarn workspace mastra-pdf-importer run fixtures:extract  # genera fixture desde PDF
```

## Tests & Cobertura

```bash
yarn workspace mastra-pdf-importer run test:verbose
yarn workspace mastra-pdf-importer run test:cov
```

Genera carpeta `coverage/` (V8).

## Métricas

`curation-metrics` produce:

```json
{
  "total": 0,
  "normalized": 0,
  "withPayeeSuggestion": 0,
  "withCategorySuggestion": 0,
  "duplicates": 0,
  "fromMemoryPayee": 0,
  "fromMemoryCategory": 0,
  "avgScore": 0
}
```

## Issue taxonomy

* `invalid_date`
* `invalid_amount`
* `hash_collision`
* `missing_required_field`
* `normalization_failure`

## Memoria

Archivo JSON por usuario en `data/memory/{userId}.json`:

```json
{
  "payeeMap": { "hash|secondaryKey": "PAYEE" },
  "categoryMap": { "hash": "CATEGORY" },
  "corrections": [],
  "historyVersion": 1
}
```

Secondary key: `<normalizedDescription>::<importeRedondeado>`.

## Próximas mejoras

* Test E2E con snapshot curator output.
* Secondary key también para categorías.
* Ajuste dinámico de pesos duplicate.
* Persistencia SQLite / LibSQL file.

## Licencia

MIT (hereda configuración del monorepo).
