#!/usr/bin/env node

console.log('🧪 Testing PDF-Parse Library Directly');
console.log('=' .repeat(50));

const fs = require('fs');
const path = require('path');

async function testPDFParse() {
  try {
    // Import pdf-parse
    const pdfParse = require('pdf-parse');
    console.log('✅ pdf-parse library loaded');
    
    // Read the real PDF file
    const pdfPath = path.join(__dirname, 'PDF_MOVIMIENTOS_SANTANDER.pdf');
    console.log('📁 Reading file:', pdfPath);
    
    const buffer = fs.readFileSync(pdfPath);
    console.log('📊 File size:', buffer.length, 'bytes');
    
    // Check if it's a real PDF
    const header = buffer.toString('utf8', 0, 10);
    console.log('🔍 File header:', header);
    
    if (!header.startsWith('%PDF-')) {
      console.log('❌ Not a real PDF file');
      return;
    }
    
    console.log('✅ Confirmed: Real PDF file');
    console.log('🔧 Extracting text...');
    
    // Extract text from PDF
    const pdfData = await pdfParse(buffer);
    
    console.log('\n📄 PDF INFO:');
    console.log('- Pages:', pdfData.numpages);
    console.log('- Text length:', pdfData.text.length);
    console.log('\n🔤 EXTRACTED TEXT (first 500 chars):');
    console.log(pdfData.text.substring(0, 500));
    console.log('\n📝 FULL TEXT:');
    console.log(pdfData.text);
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error('Stack:', err.stack);
  }
}

testPDFParse();
