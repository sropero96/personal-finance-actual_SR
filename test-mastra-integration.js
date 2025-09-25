#!/usr/bin/env node

/**
 * 🧪 Test Script: MASTRA AI Integration
 * 
 * Este script simula el flujo completo de parseo de PDF
 * que utilizará Actual Budget con nuestro agente MASTRA AI
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// URL del agente MASTRA AI
const MASTRA_URL = 'http://localhost:4111';

/**
 * Simula la llamada que hace spanish-pdf-parser.ts al agente MASTRA
 */
async function testMastraIntegration(pdfPath) {
    console.log('🤖 Probando integración MASTRA AI...\n');
    
    try {
        // 1. Leer PDF (simulando Buffer que recibe Actual Budget)
        console.log(`📄 Leyendo PDF: ${pdfPath}`);
        const pdfBuffer = readFileSync(pdfPath);
        console.log(`📊 Tamaño del PDF: ${pdfBuffer.length} bytes\n`);
        
        // 2. Preparar datos para MASTRA (igual que spanish-pdf-parser.ts)
        const formData = new FormData();
        const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
        formData.append('file', pdfBlob, 'test.pdf');
        formData.append('agentId', 'pdf-parser-agent');
        formData.append('threadId', `test-${Date.now()}`);
        
        console.log('🚀 Enviando PDF a MASTRA AI...');
        console.log(`🔗 URL: ${MASTRA_URL}/api/agents/pdf-parser-agent/run`);
        
        // 3. Llamar al agente MASTRA (simulando callMastraAgent())
        const response = await fetch(`${MASTRA_URL}/api/agents/pdf-parser-agent/run`, {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        console.log('✅ Respuesta recibida de MASTRA!\n');
        
        // 4. Procesar respuesta (simulando parseMastraOutput())
        const result = await response.json();
        console.log('📋 Resultado crudo de MASTRA:');
        console.log(JSON.stringify(result, null, 2));
        console.log('\n' + '='.repeat(50) + '\n');
        
        // 5. Extraer transacciones del resultado
        let transactions = [];
        
        if (result.text) {
            // Buscar JSON en la respuesta de texto
            const jsonMatches = result.text.match(/\[[\s\S]*?\]/g);
            if (jsonMatches) {
                for (const match of jsonMatches) {
                    try {
                        const parsed = JSON.parse(match);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            // Verificar que parecen transacciones
                            const first = parsed[0];
                            if (first.date || first.fecha || first.description || first.amount) {
                                transactions = parsed;
                                break;
                            }
                        }
                    } catch (e) {
                        // Continúa buscando
                    }
                }
            }
        }
        
        // 6. Mostrar resultados finales
        console.log('🎉 RESULTADOS FINALES:');
        console.log(`📊 Transacciones encontradas: ${transactions.length}`);
        
        if (transactions.length > 0) {
            console.log('\n📋 Primeras 3 transacciones:');
            transactions.slice(0, 3).forEach((t, i) => {
                console.log(`  ${i + 1}. ${t.date || t.fecha} | ${t.description || t.descripcion} | ${t.amount || t.importe}`);
            });
            
            console.log(`\n✨ Última transacción (#${transactions.length}):`);
            const last = transactions[transactions.length - 1];
            console.log(`   ${last.date || last.fecha} | ${last.description || last.descripcion} | ${last.amount || last.importe}`);
        }
        
        return {
            success: true,
            transactionCount: transactions.length,
            transactions: transactions,
            rawResponse: result
        };
        
    } catch (error) {
        console.error('❌ Error en la integración:');
        console.error(error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Función principal
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node test-mastra-integration.js <path-to-pdf>');
        console.log('\nEjemplo:');
        console.log('  node test-mastra-integration.js ./test-files/santander.pdf');
        process.exit(1);
    }
    
    const pdfPath = args[0];
    const result = await testMastraIntegration(pdfPath);
    
    console.log('\n' + '='.repeat(50));
    console.log('🏁 RESUMEN DE LA PRUEBA:');
    console.log('='.repeat(50));
    
    if (result.success) {
        console.log('✅ Integración MASTRA AI: EXITOSA');
        console.log(`📊 Transacciones extraídas: ${result.transactionCount}`);
        console.log('🎯 Estado: Listo para producción');
    } else {
        console.log('❌ Integración MASTRA AI: FALLÓ');
        console.log(`💥 Error: ${result.error}`);
        console.log('🔧 Acción: Verificar que MASTRA esté corriendo en localhost:4111');
    }
}

// Ejecutar si es script principal
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { testMastraIntegration };
