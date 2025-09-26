// PDF Analysis Script - Fase 0
// Analizar patrones en PDFs de Santander y Revolut

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const analysisResults = {
  santander: {
    files: [],
    patterns: {
      bankIdentifiers: [],
      dateFormats: [],
      transactionStructures: [],
      amountFormats: [],
      accountFormats: []
    }
  },
  revolut: {
    files: [],
    patterns: {
      bankIdentifiers: [],
      dateFormats: [],
      transactionStructures: [],
      amountFormats: [],
      accountFormats: []
    }
  }
};

async function extractTextFromPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  
  // Simular páginas dividiendo por saltos de página
  const pages = data.text.split('\f').map((pageText, index) => ({
    pageNumber: index + 1,
    text: pageText.trim()
  }));
  
  return { 
    fullText: data.text, 
    pages: pages, 
    numPages: data.numpages || 1 
  };
}

function analyzeSantanderPatterns(text, fileName) {
  console.log(`\n🏦 Analizando Santander: ${fileName}`);
  
  // Buscar identificadores del banco
  const bankIds = text.match(/BANCO SANTANDER|SANTANDER CONSUMER|SANTANDER/gi) || [];
  console.log('📋 Bank Identifiers:', [...new Set(bankIds)]);
  
  // Buscar patrones de fecha
  const dates = text.match(/\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}|\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
  console.log('📅 Date Patterns (first 5):', dates.slice(0, 5));
  
  // Buscar patrones de cantidad (formato español)
  const amounts = text.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g) || [];
  console.log('💰 Amount Patterns (first 5):', amounts.slice(0, 5));
  
  // Buscar números de cuenta
  const accounts = text.match(/\d{4}[\s-]?\d{4}[\s-]?\d{2}[\s-]?\d{10}|\d{20}/g) || [];
  console.log('🏧 Account Numbers:', accounts.slice(0, 3));
  
  // Buscar estructura de transacciones (líneas que parecen transacciones)
  const transactionLines = text.match(/\d{2}\/\d{2}\/\d{4}.*?-?\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
  console.log('📊 Sample Transaction Lines:');
  transactionLines.slice(0, 3).forEach((line, i) => {
    console.log(`   ${i + 1}. ${line.substring(0, 80)}...`);
  });
  
  return {
    bankIdentifiers: [...new Set(bankIds)],
    dateFormats: [...new Set(dates.slice(0, 10))],
    amountFormats: [...new Set(amounts.slice(0, 10))],
    accountNumbers: [...new Set(accounts)],
    sampleTransactions: transactionLines.slice(0, 5)
  };
}

function analyzeRevolutPatterns(text, fileName) {
  console.log(`\n🏦 Analizando Revolut: ${fileName}`);
  
  // Buscar identificadores del banco
  const bankIds = text.match(/Revolut|REVOLUT/gi) || [];
  console.log('📋 Bank Identifiers:', [...new Set(bankIds)]);
  
  // Buscar patrones de fecha (formato inglés)
  const dates = text.match(/\d{2}\s\w{3}\s\d{4}|\d{1,2}\s\w{3}\s\d{4}/g) || [];
  console.log('📅 Date Patterns (first 5):', dates.slice(0, 5));
  
  // Buscar patrones de cantidad con moneda
  const amounts = text.match(/[A-Z]{3}\s-?\d+\.\d{2}|-?\d+\.\d{2}\s[A-Z]{3}/g) || [];
  console.log('💰 Amount Patterns (first 5):', amounts.slice(0, 5));
  
  // Buscar información de cuenta
  const holders = text.match(/Account holder[:\s]+.+/gi) || [];
  console.log('👤 Account Holders:', holders.slice(0, 2));
  
  // Buscar estructura de transacciones
  const transactionLines = text.match(/\d{2}\s\w{3}\s\d{4}.*?[A-Z]{3}\s-?\d+\.\d{2}/g) || [];
  console.log('📊 Sample Transaction Lines:');
  transactionLines.slice(0, 3).forEach((line, i) => {
    console.log(`   ${i + 1}. ${line.substring(0, 80)}...`);
  });
  
  return {
    bankIdentifiers: [...new Set(bankIds)],
    dateFormats: [...new Set(dates.slice(0, 10))],
    amountFormats: [...new Set(amounts.slice(0, 10))],
    accountHolders: [...new Set(holders)],
    sampleTransactions: transactionLines.slice(0, 5)
  };
}

async function analyzePDFs() {
  console.log('🔍 INICIANDO ANÁLISIS DE PATRONES PDF - FASE 0\n');
  
  const pdfDir = './sample-pdfs';
  const files = fs.readdirSync(pdfDir);
  
  // Analizar PDFs de Santander
  const santanderFiles = files.filter(f => f.toUpperCase().includes('SANTANDER'));
  console.log('📁 Archivos Santander encontrados:', santanderFiles);
  
  for (const file of santanderFiles) {
    try {
      const filePath = path.join(pdfDir, file);
      const { fullText, pages, numPages } = await extractTextFromPDF(filePath);
      
      const patterns = analyzeSantanderPatterns(fullText, file);
      analysisResults.santander.files.push({
        fileName: file,
        numPages,
        patterns
      });
      
    } catch (error) {
      console.error(`❌ Error analizando ${file}:`, error.message);
    }
  }
  
  // Analizar PDFs de Revolut
  const revolutFiles = files.filter(f => f.toUpperCase().includes('REVOLUT'));
  console.log('\n📁 Archivos Revolut encontrados:', revolutFiles);
  
  for (const file of revolutFiles) {
    try {
      const filePath = path.join(pdfDir, file);
      const { fullText, pages, numPages } = await extractTextFromPDF(filePath);
      
      const patterns = analyzeRevolutPatterns(fullText, file);
      analysisResults.revolut.files.push({
        fileName: file,
        numPages,
        patterns
      });
      
    } catch (error) {
      console.error(`❌ Error analizando ${file}:`, error.message);
    }
  }
  
  // Generar resumen consolidado
  generateConsolidatedPatterns();
}

function generateConsolidatedPatterns() {
  console.log('\n📋 RESUMEN CONSOLIDADO DE PATRONES\n');
  
  // Consolidar patrones de Santander
  console.log('🏦 SANTANDER - Patrones Identificados:');
  const santanderBankIds = new Set();
  const santanderDates = new Set();
  const santanderAmounts = new Set();
  
  analysisResults.santander.files.forEach(file => {
    file.patterns.bankIdentifiers.forEach(id => santanderBankIds.add(id));
    file.patterns.dateFormats.forEach(date => santanderDates.add(date));
    file.patterns.amountFormats.forEach(amount => santanderAmounts.add(amount));
  });
  
  console.log('   📋 Bank IDs:', Array.from(santanderBankIds).slice(0, 3));
  console.log('   📅 Date Formats:', Array.from(santanderDates).slice(0, 5));
  console.log('   💰 Amount Formats:', Array.from(santanderAmounts).slice(0, 5));
  
  // Consolidar patrones de Revolut
  console.log('\n🏦 REVOLUT - Patrones Identificados:');
  const revolutBankIds = new Set();
  const revolutDates = new Set();
  const revolutAmounts = new Set();
  
  analysisResults.revolut.files.forEach(file => {
    file.patterns.bankIdentifiers.forEach(id => revolutBankIds.add(id));
    file.patterns.dateFormats.forEach(date => revolutDates.add(date));
    file.patterns.amountFormats.forEach(amount => revolutAmounts.add(amount));
  });
  
  console.log('   📋 Bank IDs:', Array.from(revolutBankIds).slice(0, 3));
  console.log('   📅 Date Formats:', Array.from(revolutDates).slice(0, 5));
  console.log('   💰 Amount Formats:', Array.from(revolutAmounts).slice(0, 5));
  
  // Guardar resultados
  const resultsPath = './analysis-results.json';
  fs.writeFileSync(resultsPath, JSON.stringify(analysisResults, null, 2));
  console.log(`\n💾 Resultados guardados en: ${resultsPath}`);
  
  generateRegexPatterns();
}

function generateRegexPatterns() {
  console.log('\n🔧 GENERANDO PATRONES REGEX PARA IMPLEMENTACIÓN\n');
  
  // Generar patrones para Santander
  console.log('// SANTANDER PATTERNS');
  console.log('const SANTANDER_PATTERNS = {');
  console.log('  bankIdentifier: /BANCO SANTANDER|SANTANDER CONSUMER|SANTANDER/i,');
  console.log('  dateFormat: /\\d{2}\\/\\d{2}\\/\\d{4}/g,');
  console.log('  amountFormat: /(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})/g,');
  console.log('  transactionLine: /(\\d{2}\\/\\d{2}\\/\\d{4})\\s+(.*?)\\s+(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\s+(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})/g,');
  console.log('  accountNumber: /\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{2}[\\s-]?\\d{10}/g');
  console.log('};');
  
  console.log('\n// REVOLUT PATTERNS');
  console.log('const REVOLUT_PATTERNS = {');
  console.log('  bankIdentifier: /Revolut|REVOLUT LTD/i,');
  console.log('  dateFormat: /\\d{2}\\s\\w{3}\\s\\d{4}/g,');
  console.log('  amountFormat: /[A-Z]{3}\\s-?\\d+\\.\\d{2}/g,');
  console.log('  transactionLine: /(\\d{2}\\s\\w{3}\\s\\d{4})\\s+(.*?)\\s+([A-Z]{3})\\s+(-?\\d+\\.\\d{2})/g,');
  console.log('  accountHolder: /Account holder[:\\s]+(.+)/i');
  console.log('};');
  
  console.log('\n✅ Análisis completado. Patrones listos para implementación en las tools.');
}

// Ejecutar análisis
analyzePDFs().catch(console.error);
