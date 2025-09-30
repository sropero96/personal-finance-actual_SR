#!/bin/bash
# Script para iniciar el servicio completo de importación de PDFs
# Inicia tanto Mastra dev (playground + API) como el wrapper HTTP

set -e

echo "🚀 Iniciando servicio de importación de PDFs..."
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: Ejecuta este script desde el directorio MASTRA-PDF-IMPORTER"
    exit 1
fi

# Verificar que existe .env
if [ ! -f ".env" ]; then
    echo "❌ Error: Falta archivo .env con OPENAI_API_KEY"
    exit 1
fi

# Cargar variables de entorno
export $(cat .env | grep -v '^#' | xargs)

# Verificar OPENAI_API_KEY
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OPENAI_API_KEY no configurado en .env"
    exit 1
fi

echo "✅ Configuración válida"
echo ""

# Limpiar procesos anteriores si existen
pkill -f "mastra dev" 2>/dev/null || true
pkill -f "tsx src/server.ts" 2>/dev/null || true
sleep 1

echo "📦 Paso 1: Iniciando Mastra Dev (puerto 4111)..."
npm run dev > /tmp/mastra-dev.log 2>&1 &
MASTRA_PID=$!

# Esperar a que Mastra esté listo
echo "⏳ Esperando que Mastra esté disponible..."
for i in {1..30}; do
    if curl -s http://localhost:4111/api > /dev/null 2>&1 || curl -s http://localhost:4111 > /dev/null 2>&1; then
        echo "✅ Mastra Dev está listo"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Mastra Dev no respondió después de 30 segundos"
        echo "📋 Ver logs: tail -f /tmp/mastra-dev.log"
        kill $MASTRA_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

echo ""
echo "📦 Paso 2: Iniciando servidor HTTP wrapper (puerto 5055)..."
npm run server > /tmp/mastra-server.log 2>&1 &
SERVER_PID=$!

# Esperar a que el servidor esté listo
echo "⏳ Esperando que el servidor HTTP esté disponible..."
for i in {1..15}; do
    if curl -s http://localhost:5055 > /dev/null 2>&1; then
        echo "✅ Servidor HTTP está listo"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "❌ Servidor HTTP no respondió después de 15 segundos"
        echo "📋 Ver logs: tail -f /tmp/mastra-server.log"
        kill $MASTRA_PID $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

echo ""
echo "✅ ¡Sistema de importación de PDFs iniciado correctamente!"
echo ""
echo "📊 Servicios activos:"
echo "   - Mastra Dev (Playground): http://localhost:4111"
echo "   - Servidor HTTP (API): http://localhost:5055"
echo ""
echo "📋 Logs disponibles en:"
echo "   - Mastra Dev: tail -f /tmp/mastra-dev.log"
echo "   - HTTP Server: tail -f /tmp/mastra-server.log"
echo ""
echo "🛑 Para detener los servicios:"
echo "   pkill -f 'mastra dev'"
echo "   pkill -f 'tsx src/server.ts'"
echo ""
echo "💡 Ahora puedes iniciar Actual Budget con:"
echo "   cd .. && yarn start:browser"
echo ""

# Mantener el script corriendo y mostrar los PIDs
echo "🔧 PIDs de los procesos:"
echo "   Mastra Dev: $MASTRA_PID"
echo "   HTTP Server: $SERVER_PID"
echo ""
echo "Presiona Ctrl+C para detener todos los servicios..."

# Trap para limpiar al salir
trap 'echo ""; echo "🛑 Deteniendo servicios..."; kill $MASTRA_PID $SERVER_PID 2>/dev/null; echo "✅ Servicios detenidos"; exit 0' INT TERM

# Mantener el script ejecutándose
wait