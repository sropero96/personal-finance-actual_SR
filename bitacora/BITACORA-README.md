# Bitácora de Desarrollo - Actual Budget

## 2025-10-29: Debug TableWithNavigator Rendering Issue (🔍 IN PROGRESS)

### Objetivo
Diagnosticar por qué las transacciones importadas desde PDFs no se muestran en el modal de importación, a pesar de que:
- El Agent Server procesa correctamente 91 transacciones
- El estado del componente tiene 93 transacciones
- Las transacciones filtradas son 93
- Pero `renderItem` nunca se ejecuta

### Hipótesis
El componente `TableWithNavigator` usa `AutoSizer` para calcular las dimensiones de la tabla. Si `AutoSizer` retorna `width === 0` o `height === 0`, el componente retorna `null` y no renderiza nada.

### Debug Logging Agregado
**Archivos modificados**:
1. `packages/desktop-client/src/components/modals/ImportTransactionsModal/ImportTransactionsModal.tsx` (línea 1005)
   - Log antes de renderizar TableWithNavigator

2. `packages/desktop-client/src/components/table.tsx` (líneas 1151, 1181-1187)
   - Log de `isEmpty` check
   - Log de `AutoSizer` width/height
   - Log cuando AutoSizer retorna null
   - Log cuando FixedSizeList se renderiza

**Logs esperados**:
```
[render] About to render TableWithNavigator with items: 93
[Table] isEmpty: false, items.length: 93, count: undefined
[Table AutoSizer] width: XXX, height: YYY
[Table AutoSizer] Rendering FixedSizeList with 93 items
```

### Deploy Realizado
```bash
# Build
yarn workspace loot-core build:browser
yarn workspace @actual-app/web build:browser

# Deploy
fly deploy --config fly.actual.toml
fly machine start 286ed00a6d65d8 -a actual-budget-sr
```

**Status**: ✅ Deployed
**URL**: https://actual-budget-sr.fly.dev
**Machine**: 286ed00a6d65d8 (version 45)
**Health checks**: 1/1 passing

**Commit**: `5a0771b4` - "debug(import): Add comprehensive logging to diagnose TableWithNavigator rendering issue"

### Próximo Paso
Usuario debe:
1. Ir a https://actual-budget-sr.fly.dev
2. Importar un PDF
3. Abrir la consola del navegador
4. Compartir los logs completos (especialmente los que empiezan con `[Table AutoSizer]`)

### Estado
🔍 **WAITING FOR USER LOGS** - Need to confirm if AutoSizer is the issue

---

## 2025-10-29: Fix Claude Model + Web Worker Environment Detection

### Objetivo
Resolver fallas en producción del sistema de importación de PDFs:
1. Detección incorrecta de entorno en Web Workers (mostraba "localhost" en producción)
2. Error de modelo Claude deprecado/no válido
   - `claude-3-5-sonnet-20241022` → `not_found_error`
   - `claude-3-5-sonnet-latest` → `not_found_error`
   - **SOLUCIÓN FINAL**: `claude-haiku-4-5` ✅

### Issues Encontrados y Resueltos

#### Issue 1: Web Worker Environment Detection (✅ Resuelto)
**Problema**:
- Console logs mostraban: `Hostname: unknown`, `Environment: DEVELOPMENT`
- Agent Server URL incorrecta: `http://localhost:4000` (debería ser `https://actual-agent-sr.fly.dev`)
- Error: `Failed to fetch`

**Root Cause**:
- El código de detección de entorno usaba `window.location`
- Los Web Workers NO tienen acceso a `window`, solo a `self`
- El PDF processor corre en Web Worker (`kcab.worker.B8D6AquI.js`)

**Solución**:
```typescript
// ANTES (❌ No funciona en Web Workers)
if (typeof window !== 'undefined') {
  hostname = window.location.hostname;
}

// DESPUÉS (✅ Funciona en ambos contextos)
const location = typeof self !== 'undefined' && self.location
  ? self.location
  : typeof window !== 'undefined'
  ? window.location
  : null;
```

**Archivos modificados**:
- `packages/loot-core/src/server/transactions/import/claude-pdf-processor.ts`
- `packages/desktop-client/src/util/agent2-service.ts`

**Commit**: `2d1884ce` - "fix(agents): Improve environment detection for Agent Server URL"

#### Issue 2: Claude Model Deprecated (✅ Resuelto)
**Problema**:
- Agent Server retornaba 500 error
- Console logs: `"model: claude-3-5-sonnet-20241022"`, `"type":"not_found_error"`
- Anthropic deprecó este modelo

**Solución**:
- Actualizar a `claude-3-5-sonnet-latest` en ambos agentes
- Línea 304: Agent 1 (PDF Parser)
- Línea 691: Agent 2 (Category Suggester)

**Commit**: `e17dd8ea` - "fix(agent-server): Update deprecated Claude model to latest version"

#### Issue 3: Claude Model Still Invalid (✅ Resuelto)
**Problema**:
- Después del deploy con `claude-3-5-sonnet-latest`, seguía fallando
- Console logs: `"model: claude-3-5-sonnet-latest"`, `"type":"not_found_error"`
- El modelo "latest" tampoco es válido en la API de Anthropic

**Investigación**:
- Consultado documentación oficial de Anthropic
- Nuevo modelo lanzado: Claude Haiku 4.5
- Nombre oficial del modelo: `claude-haiku-4-5`
- Fuente: https://www.anthropic.com/news/claude-haiku-4-5

**Solución**:
- Actualizar a `claude-haiku-4-5` en ambos agentes
- Línea 304: Agent 1 (PDF Parser)
- Línea 691: Agent 2 (Category Suggester)

**Commit**: `dbbd3d97` - "fix(agent-server): Update to Claude Haiku 4.5 model"

### Deploys Realizados

#### Deploy 1: Web Worker Fix (✅ Completado)
```bash
# Build browser bundles
yarn workspace loot-core build:browser
yarn workspace @actual-app/web build:browser

# Deploy
fly deploy --config fly.actual.toml
```
- **Nuevo worker bundle**: `kcab.worker.CdPtxaIO.js` (reemplaza `B8D6AquI.js`)
- **Resultado**: Environment detection correcta en production

#### Deploy 2: Claude Model Update (❌ Falló - modelo inválido)
```bash
fly deploy --config fly.agent.toml
```
- **Modelo usado**: `claude-3-5-sonnet-latest`
- **Resultado**: Modelo no válido, mismo error 404

#### Deploy 3: Haiku 4.5 Model (✅ Completado - PRODUCCIÓN FINAL)
```bash
fly deploy --config fly.agent.toml
```
- **Modelo**: `claude-haiku-4-5` (nuevo modelo de Anthropic)
- **Image size**: 76 MB
- **Build time**: ~2 minutos (cached layers)
- **Machine**: 6e82959fd43d68 (version 9)
- **Health checks**: 2/2 passing
- **Status**: ✅ Running

### Verificación

#### Agent Server Health
```bash
curl https://actual-agent-sr.fly.dev/health
# Response: {"status":"healthy","apiKeyConfigured":true}
```

#### Fly.io Status
| App | Machine ID | Version | Status | Health Checks | Model |
|-----|------------|---------|--------|---------------|-------|
| actual-agent-sr | 6e82959fd43d68 | 9 | ✅ started | 2/2 passing | claude-haiku-4-5 |
| actual-budget-sr | 286ed00a6d65d8 | - | ✅ started | 1/1 passing | - |

### Próximos Pasos
1. **Testing manual** - Usuario debe probar importación de PDF en https://actual-budget-sr.fly.dev
2. **Validar** - Confirmar que las transacciones se extraen correctamente
3. **Monitorear** - Revisar logs para errores: `fly logs -a actual-agent-sr`

### Commits Relacionados
- **2d1884ce**: fix(agents): Improve environment detection for Agent Server URL (Web Worker fix)
- **e17dd8ea**: fix(agent-server): Update deprecated Claude model to latest version (falló - modelo inválido)
- **dbbd3d97**: fix(agent-server): Update to Claude Haiku 4.5 model (✅ PRODUCCIÓN FINAL)

---

## 2025-10-28: Deploy de Agent 2 Fixes a Fly.io

### Objetivo
Desplegar Agent 2 (AI Categorization) a producción en Fly.io después de completar todas las correcciones de TypeScript.

### Estado Inicial
- **Apps en Fly.io**: Ambas suspended
  - `actual-agent-sr` (Agent Server - contiene Agent 1 y Agent 2)
  - `actual-budget-sr` (Aplicación web)
- **API Key**: Ya configurada en Fly.io secrets
- **Código**: Agent 2 corregido localmente, 0 errores TypeScript

### Tareas Realizadas

#### 1. Reactivación de Apps (✅ Completado)
```bash
fly machine start 6e82959fd43d68 -a actual-agent-sr
fly machine start 286ed00a6d65d8 -a actual-budget-sr
```
- Ambas máquinas iniciadas exitosamente
- Health checks: passing

#### 2. Commit y Push a GitHub (✅ Completado)
```bash
git add -A
git commit -m "fix(agent2): Resolve all TypeScript errors for AI Categorization..."
git push origin master
```
- **Commit**: 142d0dcd
- **Archivos modificados**: 7
- **Cambios**: +1471 -74 líneas

**Archivos modificados**:
1. `useAgent2Context.ts` - 40 líneas
2. `modalsSlice.ts` - 12 líneas
3. `Account.tsx` - 2 líneas
4. `AICategorizeModal.tsx` - 3 líneas
5. `agent2_test_plan.md` - Nueva documentación (20 KB)
6. `session_summary_agent2_fixes.md` - Resumen de sesión

#### 3. Deploy Agent Server (✅ Completado)
```bash
fly deploy --config fly.agent.toml
```
- **Build tiempo**: ~2 minutos
- **Tamaño imagen**: 76 MB
- **URL**: https://actual-agent-sr.fly.dev
- **Machine ID**: 6e82959fd43d68
- **Health checks**:
  - TCP :4000 ✅ passing
  - HTTP :4000 ✅ passing ({"status":"healthy","apiKeyConfigured":true})

#### 4. Deploy Actual Budget (✅ Completado)
```bash
fly deploy --config fly.actual.toml
```
- **Build tiempo**: ~3 minutos
- **Tamaño imagen**: 297 MB
- **URL**: https://actual-budget-sr.fly.dev
- **Machine ID**: 286ed00a6d65d8
- **Health checks**:
  - TCP :5006 ✅ passing

**Build stages**:
1. Builder stage (Node 20 Bullseye) - 1m 52s
   - Dependencies: 1842 packages (198.78 MB)
   - loot-core build: 23s
   - @actual-app/web build: 1m 13s
   - sync-server build: 5.7s
2. Runtime stage (Node 20 Bullseye Slim) - 30s
   - Copiar artifacts
   - Crear symlinks
   - Configurar permisos

### Estado Final

| App | URL | Tamaño | Estado | Health |
|-----|-----|--------|--------|--------|
| **Agent Server** | https://actual-agent-sr.fly.dev | 76 MB | ✅ Running | 2/2 passing |
| **Actual Budget** | https://actual-budget-sr.fly.dev | 297 MB | ✅ Running | 1/1 passing |

### Verificación de Funcionalidad

#### Agent 1 (PDF Parser)
**Endpoint**: `POST https://actual-agent-sr.fly.dev/api/process-pdf`
**Estado**: ✅ Desplegado
**Funcionalidad**:
- Extrae transacciones de PDFs de Santander y Revolut España
- Cura nombres de payees inteligentemente
- Devuelve JSON estructurado con transacciones

#### Agent 2 (AI Categorizer)
**Endpoint**: `POST https://actual-agent-sr.fly.dev/api/suggest-categories`
**Estado**: ✅ Desplegado
**Funcionalidad**:
- Recibe transacciones + contexto (categorías, reglas, historial)
- Optimiza llamadas a Claude API (solo casos inciertos)
- Devuelve sugerencias con confidence scores

### Cómo Probar

#### Probar Agent 1 (PDF Parser):
1. Ir a https://actual-budget-sr.fly.dev
2. Click "Import Transactions"
3. Subir un PDF de Santander o Revolut
4. Verificar que extrae todas las transacciones

#### Probar Agent 2 (AI Categorizer):
1. En Actual Budget, seleccionar 2-3 transacciones
2. Presionar tecla **'I'** (o "Selected" → "AI Categorize")
3. Verificar que aparece modal con sugerencias
4. Revisar confidence scores y reasoning
5. Aplicar categorías

### Issues Encontrados

#### Issue 1: Actual Budget machine stopped después del deploy
**Problema**: La máquina no inició automáticamente después del deploy
**Solución**:
```bash
fly machine start 286ed00a6d65d8 -a actual-budget-sr
```
**Status**: ✅ Resuelto

### Métricas

#### Build Times
- Agent Server: 2m 20s
- Actual Budget: 3m 15s

#### Image Sizes
- Agent Server: 76 MB (optimizado)
- Actual Budget: 297 MB (incluye todo el frontend + sync server)

#### Health Checks
- Agent Server: 2/2 passing (TCP + HTTP con health endpoint)
- Actual Budget: 1/1 passing (TCP)

### Próximos Pasos

1. **Testing Manual** (Siguiente sesión)
   - Probar Agent 1 con PDFs reales de Santander y Revolut
   - Probar Agent 2 con 50 transacciones variadas
   - Medir accuracy: target >85%

2. **Monitoreo**
   - Revisar logs: `fly logs -a actual-agent-sr`
   - Revisar logs: `fly logs -a actual-budget-sr`
   - Verificar costos de Claude API

3. **Optimizaciones** (Opcional)
   - Implementar caching de sugerencias
   - Añadir retry logic con exponential backoff
   - Mejorar fuzzy matching de payees

### Commits Relacionados

- **142d0dcd**: fix(agent2): Resolve all TypeScript errors for AI Categorization
- **4849bfa6**: feat(agent2): Complete Agent 2 integration in ImportTransactionsModal
- **ec4ec42f**: docs: Add comprehensive deployment analysis report

### Recursos

#### URLs de Producción
- Actual Budget: https://actual-budget-sr.fly.dev
- Agent Server: https://actual-agent-sr.fly.dev
- Agent Health: https://actual-agent-sr.fly.dev/health

#### Documentación
- Test Plan: `/TEMP-DOC/agent2_test_plan.md`
- Session Summary: `/TEMP-DOC/session_summary_agent2_fixes.md`
- Fix Plan: `/TEMP-DOC/fix_plan.md`
- Repo Map: `/TEMP-DOC/repo_map.md`

#### Fly.io Commands
```bash
# Ver status
fly status -a actual-agent-sr
fly status -a actual-budget-sr

# Ver health checks
fly checks list -a actual-agent-sr
fly checks list -a actual-budget-sr

# Ver logs
fly logs -a actual-agent-sr
fly logs -a actual-budget-sr

# Restart
fly machine restart 6e82959fd43d68 -a actual-agent-sr
fly machine restart 286ed00a6d65d8 -a actual-budget-sr
```

### Notas Técnicas

#### Arquitectura de Agentes
- **Agent Server**: Un solo servidor Node.js/Express que contiene AMBOS agentes
- **Agent 1 (PDF Parser)**: Endpoint `/api/process-pdf`
- **Agent 2 (Categorizer)**: Endpoint `/api/suggest-categories`
- **Ventaja**: Compartir configuración de API key, logging, CORS, etc.

#### TypeScript Fixes Aplicados
1. **payee_name → imported_payee** (6 ocurrencias)
2. **useQuery(() => query)** en lugar de **useQuery(query)** (2 ocurrencias)
3. **CategoryViews.list** en lugar de **CategoryViews** directo (2 ocurrencias)
4. **Modal type union** para 'ai-categorize' (1 ocurrencia)
5. **isDisabled** en lugar de **disabled** (2 ocurrencias)
6. **onClose callback** agregado (1 ocurrencia)

#### Resultado Final
- **TypeScript errors Agent 2**: 27 → 0 (100% resuelto)
- **Total project errors**: 32 → 12 (63% reducción)
- **Remaining errors**: NO relacionados con Agent 2 (Agent 1 legacy issues)

---

**Session Status**: ✅ **COMPLETE**
**Deployment Status**: ✅ **SUCCESS**
**Next Action**: User testing en producción
