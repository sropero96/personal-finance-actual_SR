// Análisis Detallado de Patrones - Fase 0
// Examinar líneas específicas y estructuras más profundas

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function deepAnalyzePDF(pdfPath, bankType) {
  console.log(`\n🔍 ANÁLISIS PROFUNDO: ${path.basename(pdfPath)}`);
  console.log(`📁 Tipo: ${bankType.toUpperCase()}`);
  
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  
  const text = data.text;
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  console.log(`📄 Páginas: ${data.numpages}`);
  console.log(`📝 Total líneas: ${lines.length}`);
  
  if (bankType === 'santander') {
    analyzeSantanderStructure(text, lines);
  } else if (bankType === 'revolut') {
    analyzeRevolutStructure(text, lines);
  }
}

function analyzeSantanderStructure(text, lines) {
  console.log('\n📊 ESTRUCTURA SANTANDER:');
  
  // Buscar headers típicos de Santander
  const headers = lines.filter(line => 
    line.includes('SANTANDER') || 
    line.includes('EXTRACTO') || 
    line.includes('CUENTA') ||
    line.includes('PERIODO') ||
    line.includes('SALDO')
  );
  console.log('📋 Headers encontrados:', headers.slice(0, 5));
  
  // Buscar líneas que parecen transacciones (fecha + descripción + importe)
  const transactionLines = lines.filter(line => {
    const hasDate = /\d{2}\/\d{2}\/\d{4}/.test(line);
    const hasAmount = /-?\d{1,3}(?:\.\d{3})*,\d{2}/.test(line);
    return hasDate && hasAmount && line.length > 20;
  });
  
  console.log('\n💰 TRANSACCIONES IDENTIFICADAS:');
  console.log(`📊 Total encontradas: ${transactionLines.length}`);
  console.log('📝 Ejemplos de líneas de transacciones:');
  transactionLines.slice(0, 8).forEach((line, i) => {
    console.log(`   ${i + 1}. ${line}`);
  });
  
  // Analizar estructura típica de línea de transacción
  if (transactionLines.length > 0) {
    console.log('\n🔍 ANÁLISIS DE ESTRUCTURA DE TRANSACCIÓN:');
    const sampleLine = transactionLines[0];
    console.log(`📋 Línea ejemplo: "${sampleLine}"`);
    
    // Intentar dividir la línea
    const dateMatch = sampleLine.match(/(\d{2}\/\d{2}\/\d{4})/);
    const amountMatches = sampleLine.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g);
    
    if (dateMatch) console.log(`📅 Fecha: ${dateMatch[1]}`);
    if (amountMatches) console.log(`💰 Importes: ${amountMatches.join(', ')}`);
    
    // Buscar patrones de descripción
    let description = sampleLine;
    if (dateMatch) {
      description = description.replace(dateMatch[1], '').trim();
    }
    if (amountMatches) {
      amountMatches.forEach(amount => {
        description = description.replace(amount, '').trim();
      });
    }
    console.log(`📝 Descripción: "${description}"`);
  }
  
  // Buscar información de cuenta y saldos
  const accountLines = lines.filter(line => 
    /\d{20}/.test(line) || 
    line.includes('SALDO') ||
    line.includes('CUENTA')
  );
  console.log('\n🏧 INFO DE CUENTA:');
  accountLines.slice(0, 3).forEach(line => console.log(`   ${line}`));
}

function analyzeRevolutStructure(text, lines) {
  console.log('\n📊 ESTRUCTURA REVOLUT:');
  
  // Buscar headers típicos de Revolut
  const headers = lines.filter(line => 
    line.toLowerCase().includes('revolut') || 
    line.includes('Statement') ||
    line.includes('Account') ||
    line.includes('Period') ||
    line.includes('Balance')
  );
  console.log('📋 Headers encontrados:', headers.slice(0, 5));
  
  // Buscar líneas que parecen transacciones (fecha en formato diferente)
  const transactionLines = lines.filter(line => {
    // Revolut usa formatos como "4 ago 2025" o "1 jul 2025"
    const hasDate = /\d{1,2}\s(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s\d{4}/.test(line.toLowerCase()) ||
                    /\d{1,2}\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s\d{4}/.test(line.toLowerCase());
    const hasAmount = /\d+\.\d{2}/.test(line);
    return hasDate && hasAmount && line.length > 10;
  });
  
  console.log('\n💰 TRANSACCIONES IDENTIFICADAS:');
  console.log(`📊 Total encontradas: ${transactionLines.length}`);
  console.log('📝 Ejemplos de líneas de transacciones:');
  transactionLines.slice(0, 8).forEach((line, i) => {
    console.log(`   ${i + 1}. ${line}`);
  });
  
  // Buscar líneas con monedas
  const currencyLines = lines.filter(line => 
    /EUR|USD|GBP|CHF/.test(line) && 
    /\d+\.\d{2}/.test(line)
  );
  console.log('\n💱 LÍNEAS CON MONEDAS:');
  currencyLines.slice(0, 5).forEach(line => console.log(`   ${line}`));
  
  // Buscar información de titular
  const holderLines = lines.filter(line => 
    line.toLowerCase().includes('account holder') ||
    line.toLowerCase().includes('titular') ||
    line.toLowerCase().includes('name')
  );
  console.log('\n👤 INFO DE TITULAR:');
  holderLines.slice(0, 3).forEach(line => console.log(`   ${line}`));
  
  // Buscar todas las líneas que contienen fechas para entender el patrón
  console.log('\n📅 TODAS LAS LÍNEAS CON FECHAS:');
  const dateLines = lines.filter(line => {
    return /\d{1,2}\s(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s\d{4}/.test(line.toLowerCase());
  });
  dateLines.slice(0, 10).forEach(line => console.log(`   ${line}`));
}

async function runDeepAnalysis() {
  console.log('🚀 INICIANDO ANÁLISIS PROFUNDO DE ESTRUCTURAS PDF\n');
  
  const pdfDir = './sample-pdfs';
  
  // Analizar un PDF de cada tipo para entender mejor la estructura
  const santanderSample = 'SANTANDER_AUG3_25.pdf';
  const revolutSample = 'REVOLUT_AUG25.pdf';
  
  try {
    await deepAnalyzePDF(path.join(pdfDir, santanderSample), 'santander');
    await deepAnalyzePDF(path.join(pdfDir, revolutSample), 'revolut');
    
    console.log('\n✅ ANÁLISIS PROFUNDO COMPLETADO');
    console.log('\n📋 PRÓXIMOS PASOS:');
    console.log('1. Refinar patrones regex basados en estructuras encontradas');
    console.log('2. Implementar parsers específicos con patrones reales');
    console.log('3. Probar extracción con diferentes PDFs');
    
  } catch (error) {
    console.error('❌ Error en análisis:', error.message);
  }
}

// Ejecutar análisis profundo
runDeepAnalysis().catch(console.error);
