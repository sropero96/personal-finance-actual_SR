import 'dotenv/config';
import path from 'path';
import fs from 'fs';

async function debugSantanderParsing() {
  console.log('🔍 Debugging Santander PDF parsing...\n');

  const santanderPdfPath = path.join(process.cwd(), 'SANTANDER_AUG3_25.pdf');

  try {
    // 1. Extraer texto completo del PDF usando pdf-parse directamente
    console.log('📖 Step 1: Extracting PDF text...');
    if (!fs.existsSync(santanderPdfPath)) {
      console.error('❌ PDF file not found:', santanderPdfPath);
      return;
    }

    const dataBuffer = fs.readFileSync(santanderPdfPath);
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(dataBuffer);
    
    console.log(`✅ PDF read successfully - ${pdfData.numpages} pages, ${pdfData.text.length} characters`);

    // 2. Buscar patrones de fecha en el texto
    console.log('\n🔍 Step 2: Analyzing date patterns...');
    const datePattern = /\d{2}\/\d{2}\/\d{4}/g;
    const dates = pdfData.text.match(datePattern) || [];
    console.log(`Found ${dates.length} date patterns:`, dates.slice(0, 10)); // Primeros 10

    // 3. Buscar patrones de importe
    console.log('\n💰 Step 3: Analyzing amount patterns...');
    const amountPattern = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g;
    const amounts = pdfData.text.match(amountPattern) || [];
    console.log(`Found ${amounts.length} amount patterns:`, amounts.slice(0, 10)); // Primeros 10

    // 4. Buscar líneas que contengan tanto fecha como importe
    console.log('\n📋 Step 4: Finding transaction-like lines...');
    const lines = pdfData.text.split('\n');
    let transactionLines: string[] = [];
    
    for (const line of lines) {
      if (line.match(/\d{2}\/\d{2}\/\d{4}/) && line.match(/\d+,\d{2}\s*EUR/)) {
        transactionLines.push(line.trim());
      }
    }
    
    console.log(`Found ${transactionLines.length} lines with both date and amount patterns`);
    console.log('First 5 transaction lines:');
    transactionLines.slice(0, 5).forEach((line, i) => {
      console.log(`  ${i + 1}. ${line}`);
    });

    // 5. Test patterns manually
    console.log('\n🏦 Step 5: Testing Santander patterns manually...');
    
    // Patrón principal actual
    const transactionLinePattern = /Saldo:(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR\([^)]*\)\s*a\s*fecha(\d{2}\/\d{2}\/\d{4})([^€]*?):(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g;
    
    // Patrón simple actual  
    const simpleTransactionPattern = /(\d{2}\/\d{2}\/\d{4})\s+([^0-9,]+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/g;
    
    let mainPatternMatches = 0;
    let simplePatternMatches = 0;
    
    // Contar coincidencias del patrón principal
    let match;
    while ((match = transactionLinePattern.exec(pdfData.text)) !== null) {
      mainPatternMatches++;
    }
    
    // Reset regex
    simpleTransactionPattern.lastIndex = 0;
    
    // Contar coincidencias del patrón simple
    while ((match = simpleTransactionPattern.exec(pdfData.text)) !== null) {
      simplePatternMatches++;
    }
    
    console.log(`📊 Pattern Analysis:`);
    console.log(`- Main pattern matches: ${mainPatternMatches}`);
    console.log(`- Simple pattern matches: ${simplePatternMatches}`);
    console.log(`- Total manual pattern matches: ${mainPatternMatches + simplePatternMatches}`);
    
    // 6. Mostrar diferencia entre patrones esperados y encontrados
    console.log('\n📈 Analysis Summary:');
    console.log(`- Total lines with date+amount: ${transactionLines.length}`);
    console.log(`- Current patterns capture: ${mainPatternMatches + simplePatternMatches}`);
    console.log(`- Potential missing: ${transactionLines.length - (mainPatternMatches + simplePatternMatches)}`);

    if (transactionLines.length > (mainPatternMatches + simplePatternMatches)) {
      console.log('\n⚠️  Current patterns might be missing some transactions!');
      console.log('Sample lines that might not be captured:');
      transactionLines.slice(-5).forEach((line, i) => {
        console.log(`  ${i + 1}. ${line}`);
      });
    }

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugSantanderParsing()
  .then(() => console.log('\n🎉 Debug completed!'))
  .catch(error => console.error('\n💥 Debug failed:', error));
