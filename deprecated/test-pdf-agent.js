import { mastra } from '../../src/mastra/index.js';

async function testPdfAgent() {
  console.log('🧪 Testing PDF Parser Agent...\n');

  try {
    // Create a mock PDF in base64 (just for testing)
    const mockPdfContent = 'Mock PDF content for testing';
    const pdfBase64 = Buffer.from(mockPdfContent).toString('base64');

    console.log('📄 Sending test message to PDF Parser Agent...');

    const result = await mastra.agents.pdfParserAgent.run({
      message: `Extract transactions from this Spanish bank PDF. The PDF is provided in base64 format: ${pdfBase64}. Please use the pdf-ocr tool first to extract text, then use the transaction-extraction tool to parse the transactions.`
    });

    console.log('✅ Agent Response:');
    console.log(result.text);
    console.log('\n🔧 Tool Calls Made:');
    if (result.toolCalls && result.toolCalls.length > 0) {
      result.toolCalls.forEach((call, index) => {
        console.log(`${index + 1}. ${call.toolName}`);
        console.log(`   Args:`, call.args);
        console.log(`   Result:`, call.result);
      });
    } else {
      console.log('No tool calls made.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testPdfAgent();
