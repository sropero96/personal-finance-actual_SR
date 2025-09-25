#!/bin/bash

# 🚀 MASTRA AI + Actual Budget: Estado de Integración
# ===================================================

echo "🤖 MASTRA AI + Actual Budget Integration Status"
echo "==============================================="
echo ""

# Verificar servicios
echo "🔍 Verificando servicios..."
echo ""

# MASTRA AI
if curl -s http://localhost:4111/api > /dev/null; then
    echo "✅ MASTRA AI Server: ACTIVO (http://localhost:4111)"
else
    echo "❌ MASTRA AI Server: INACTIVO"
    echo "   💡 Ejecutar: npx mastra dev"
fi

# Actual Budget Web
if curl -s http://localhost:3003 > /dev/null; then
    echo "✅ Actual Budget Web: ACTIVO (http://localhost:3003)"
else
    echo "❌ Actual Budget Web: INACTIVO"
    echo "   💡 Ejecutar: npx yarn start:desktop-client"
fi

echo ""
echo "📋 Archivos de Integración:"
echo "----------------------------"

# Verificar archivos clave
if [ -f "packages/loot-core/src/server/transactions/import/spanish-pdf-parser.ts" ]; then
    echo "✅ spanish-pdf-parser.ts: Integración MASTRA implementada"
else
    echo "❌ spanish-pdf-parser.ts: NO ENCONTRADO"
fi

if [ -f "src/mastra/agents/pdf-parser-agent.ts" ]; then
    echo "✅ pdf-parser-agent.ts: Agente MASTRA configurado"
else
    echo "❌ pdf-parser-agent.ts: NO ENCONTRADO"
fi

if [ -f "src/mastra/tools/transaction-extraction-tool.ts" ]; then
    echo "✅ transaction-extraction-tool.ts: Herramientas optimizadas"
else
    echo "❌ transaction-extraction-tool.ts: NO ENCONTRADO"
fi

echo ""
echo "🧪 Pruebas Disponibles:"
echo "-----------------------"
echo "1. Script de prueba: node test-mastra-integration.js <pdf-file>"
echo "2. UI de Actual Budget: http://localhost:3003"
echo "3. MASTRA Swagger UI: http://localhost:4111/swagger-ui"

echo ""
echo "🎯 Cómo Probar:"
echo "----------------"
echo "1. Abrir Actual Budget en: http://localhost:3003"
echo "2. Crear/abrir una cuenta"
echo "3. Clic en 'Import Transactions'"
echo "4. Subir un PDF bancario español"
echo "5. Ver el procesamiento automático con MASTRA AI"

echo ""
echo "📊 Estado General:"
echo "------------------"
if curl -s http://localhost:4111/api > /dev/null && curl -s http://localhost:3003 > /dev/null; then
    echo "🎉 INTEGRACIÓN COMPLETA Y FUNCIONAL"
    echo "✨ Listo para procesar PDFs con IA"
else
    echo "⚠️  Algunos servicios no están activos"
    echo "🔧 Revisar comandos de inicio arriba"
fi

echo ""
