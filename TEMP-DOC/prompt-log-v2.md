1. Contexto del proyecto

Proyecto base: aplicación de finanzas personales open source, derivada de Actual Budget.

Objetivo agregado por mí: sumar dos agentes auxiliares dentro del ecosistema de la app.

Agente PDF → Transacciones: recibe PDFs de movimientos bancarios, extrae, procesa y estructura datos en el formato que la app necesita para importarlos correctamente.

Agente de Autocategorización: toma transacciones ya estructuradas, y según descripción, nombre del payee, reglas de categorías del usuario y el historial de la base de datos, sugiere o asigna categorías automáticamente.

Estado actual: el agente PDF funcionaba correctamente. Luego de implementar el agente de Autocategorización, el agente PDF dejó de funcionar. El agente de Autocategorización aún no fue probado de punta a punta.

2. Tu meta como agente principal

Recuperar todo el contexto funcional y técnico del repositorio.

Identificar por qué se rompió el agente PDF tras introducir el agente de Autocategorización.

Desplegar dos subagentes especializados para acelerar diagnóstico y mejoras:

Subagente A: Mapa del Repositorio. Construye una vista completa de módulos, paquetes, dependencias, flujos y puntos de integración entre los dos agentes y la app base.

Subagente B: Riesgos y Errores. Hace lint extendido, búsqueda de anti-patterns, revisión de contratos entre capas, chequeo de tipos, pruebas, migraciones, y conflictos de dependencias.

Entregar un plan de corrección y mejora priorizado, con tareas atómicas y criterios de aceptación.

3. Suposiciones y convenciones

Monorepo o multi-paquete: detectar y documentar.

Lenguajes principales y gestor de paquetes: detectar y documentar.

Formato objetivo para importación de la app: p. ej., CSV/JSON específico, OFX, QIF o un esquema propietario. Si existe un schema local, referenciarlo.

1. Alcance de la revisión técnica

Arquitectura y límites

Diagrama de módulos y flujo de datos desde PDF → parser → normalizador → validador → exportador → importador de la app.

Interfaz y contrato del agente de Autocategorización. Entradas, salidas, feature flags, y efectos secundarios.

Dependencias y build

Archivo(s) de dependencias. Versiones, choques, vulnerabilidades, peer deps, binarios nativos.

Scripts de build y runtime. Variables de entorno necesarias.

Extracción PDF

Librerías usadas, heurísticas, fallbacks para PDF escaneados vs. digitales, normalización de fechas, decimales, moneda, codificación.

Mapeo de columnas de salida al formato requerido por la app.

Autocategorización

Reglas determinísticas, similarity matching, uso de historial del usuario, payee normalization.

Confianza por predicción y política de sobrescritura manual.

Persistencia y archivos intermedios

Dónde se guardan artefactos temporales, cachés y salidas finales. Limpiar si corresponde.

Pruebas y tooling

Cobertura, pruebas unitarias y de integración. Linters, type checkers, formatters.

5. Hipótesis del fallo del agente PDF

Interferencias de dependencias nuevas del agente de Autocategorización que afecten parsing o runtime del PDF.

Cambios en rutas de importación, init de módulos compartidos, colisiones de nombres, side effects en global state.

Orden de arranque y service wiring.

Valida o refuta cada hipótesis con evidencia del código y logs.

6. Subagentes a desplegar

Subagente A: Mapa del Repositorio

Objetivo: comprender la estructura total del repo.
Tareas:

Escanear árbol de directorios, detectar paquetes, módulos, entrypoints, scripts y pipelines.

Generar un informe repo_map.md con:

Árbol de carpetas relevante con descripciones cortas.

Componentes clave y responsabilidades.

Diagrama ASCII de flujos entre componentes, incluyendo agentes y app base.

Matriz de dependencias internas y externas.

Subagente B: Riesgos y Errores

Objetivo: identificar riesgos, anti-patterns y bugs probables.
Tareas:

Ejecutar lint, type check, auditoría de dependencias, búsqueda de dead code y circular imports.

Verificar contratos entre el agente PDF y el exportador al formato de la app.

Analizar el pipeline del agente de Autocategorización y sus hooks.

Entregar risk_report.md con:

Lista priorizada de riesgos, impacto, probabilidad y remediación.

Hallazgos de dependencias y compatibilidades.

Sección “cambios mínimos para restaurar PDF”.

7. Plan de corrección y mejora

Entrega un fix_plan.md con secciones:

Causas raíz confirmadas con evidencias.

Quick fixes para restablecer el agente PDF sin afectar Autocategorización.

Refactors recomendados para aislar responsabilidades y reducir acoplamiento.

Defensas futuras: pruebas, contratos, feature flags, canary tests.

Backout plan si algo empeora.

Incluye una tabla de tareas con: ID, descripción, dueño sugerido, esfuerzo (S/M/L), prioridad (P0–P2), criterios de aceptación, dependencias.

8. Pruebas y datos de ejemplo

Genera o localiza fixtures de PDF representativos: digital nativo y escaneado. Incluye variantes con diferentes bancos, separadores decimales y formatos de fecha.

Define pruebas de extremo a extremo:

PDF de entrada → transacciones correctas en formato app.

Transacciones estructuradas → categorización sugerida con puntaje de confianza ≥ umbral.

Agrega e2e_spec.md con pasos reproducibles y comandos.

9. Criterios de aceptación

El agente PDF vuelve a procesar correctamente los PDFs provistos, con validaciones de esquema y totales conciliados.

El agente de Autocategorización puede ejecutarse sin romper el flujo del PDF.

Existen pruebas automatizadas que cubren ambos flujos y se integran al CI local del repo.

Se entregan repo_map.md, risk_report.md, fix_plan.md, e2e_spec.md en la carpeta docs/ del repo.

10. Salidas esperadas

Coloca estos archivos en docs/:

repo_map.md

risk_report.md

fix_plan.md

e2e_spec.md

CHANGELOG.md actualizado con correcciones y mejoras

11. Instrucciones operativas

Detecta gestor de paquetes y ejecuta instalación limpia. Ejemplos:

yarn install --frozen-lockfile o npm ci

pip install -r requirements.txt o uv sync

Corre linters y type checkers según el stack detectado.

Ejecuta pruebas existentes. Documenta fallos y flakes.

Restaura funcionamiento del agente PDF. Agrega pruebas si faltan.

Ejecuta el agente de Autocategorización sobre un subset de transacciones. No modifiques datos del usuario sin flag de seguridad.

Produce los informes en docs/.

12. Políticas de seguridad y datos

No subas datos reales ni credenciales a servicios externos.

Ofusca o sintetiza PDFs de ejemplo si contienen datos sensibles.

Mantén idempotencia en scripts de migración y en procesos de categorización.

13. Formato de status update final

Entrega un resumen en Markdown dentro de docs/status_update.md con:

Resumen ejecutivo en 10 viñetas.

Riesgos abiertos y mitigaciones.

Próximos 3 pasos con fechas tentativas.

14. Bloque de comandos sugeridos

Adapta según stack real detectado y agrega los que correspondan.

# 1) Instalar dependencias

make setup || true
npm ci || yarn install --frozen-lockfile || pnpm install || pip install -r requirements.txt

# 2) Linter y tipos

npm run lint || yarn lint || ruff check . || flake8 .
npm run typecheck || mypy . || pyright

# 3) Pruebas

npm test || yarn test || pytest -q || uv run pytest -q

# 4) Auditoría de dependencias

npm audit --audit-level=moderate || yarn npm audit || pip-audit || safety check

# 5) Generar docs

mkdir -p docs

# Los subagentes escriben repo_map.md, risk_report.md, fix_plan.md, e2e_spec.md, status_update.md

15. Señales de éxito

Pruebas verdes para los flujos PDF → app y Autocategorización.

Informe de riesgos con acciones claras y responsables sugeridos.

Código con límites de módulo más nítidos, sin efectos colaterales entre agentes.
