# Mastra PDF Importer (Fase 1)

Objetivo actual: extraer y estructurar transacciones desde PDFs bancarios (agente extractor) produciendo un JSON consistente (fecha ISO, descripción limpia, importe numérico, campos brutos útiles) listo para posterior post-proceso externo.

## Estado

Se ha eliminado el segundo agente experimental de curación y todas sus herramientas para simplificar el alcance inicial.

## Agente Activo

* `pdf-extractor-agent`: orquesta parsers específicos (ej. Santander, Revolut) y produce una lista de transacciones parseadas.

## Salida Esperada (ejemplo mínimo)

```json
[
  { "date": "2025-09-12", "description": "COMPRA MERCADONA TARJETA", "amount": -23.45, "raw": { /* campos originales */ } }
]
```

## Script

```bash
yarn workspace mastra-pdf-importer run dev
```

## Archivo Histórico (Experimento Curador)

La fase 2 (curación: normalización avanzada, sugerencias, duplicados, métricas, memoria) fue exploratoria y se ha retirado del código para reducir complejidad temprana. Consultar `ARCHITECTURE_OVERVIEW.md` y planes en `F1_PDF_IMPORTER/` para detalles conceptuales si se reactiva en el futuro.

## Próximos Pasos (enfoque acotado)

1. Asegurar cobertura de parsers principales.
2. Unificación de formato de fechas y normalización de importe dentro del extractor.
3. Validaciones básicas (campos obligatorios) antes de exportar.
4. Integración con pipeline externo de categorización.

## Licencia

MIT
