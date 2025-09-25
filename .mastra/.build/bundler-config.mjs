import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const pdfOcrTool = createTool({
  id: "pdf-ocr",
  description: "Extract text from PDF using basic text parsing (OCR as fallback)",
  inputSchema: z.object({
    pdfBase64: z.string().describe("PDF file encoded as base64"),
    pageRange: z.object({
      start: z.number().optional().describe("Start page (1-indexed)"),
      end: z.number().optional().describe("End page (inclusive)")
    }).optional().describe("Page range to process, if not specified processes all pages")
  }),
  outputSchema: z.object({
    extractedText: z.string().describe("Full extracted text from PDF"),
    pageCount: z.number().describe("Total number of pages processed"),
    confidence: z.number().min(0).max(1).describe("Extraction confidence score"),
    pages: z.array(z.object({
      pageNumber: z.number(),
      text: z.string(),
      confidence: z.number()
    })).describe("Per-page extracted text with confidence scores")
  }),
  execute: async (context) => {
    const { pdfBase64} = context.data;
    try {
      console.log("\u{1F50D} Starting PDF text extraction...");
      const pdfParse = (await import('pdf-parse')).default;
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      console.log("\uFFFD PDF buffer size:", pdfBuffer.length, "bytes");
      const pdfData = await pdfParse(pdfBuffer, {
        // Render text only, no images needed for banking statements
        max: 0
      });
      console.log("\u2705 PDF text extracted successfully");
      console.log("\u{1F4CA} Text length:", pdfData.text.length);
      console.log("\u{1F4C4} Number of pages:", pdfData.numpages);
      const pages = [{
        pageNumber: 1,
        text: pdfData.text,
        confidence: 0.95
        // High confidence for direct text extraction
      }];
      return {
        extractedText: pdfData.text,
        pageCount: pdfData.numpages,
        confidence: 0.95,
        pages
      };
    } catch (error) {
      console.error("\u274C PDF text extraction failed:", error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }
});

const transactionExtractionTool = createTool({
  id: "transaction-extraction",
  description: "Extract ALL structured transaction data from COMPLETE Spanish bank PDF text - processes entire document",
  inputSchema: z.object({
    extractedText: z.string().describe("Raw text extracted from PDF"),
    bankType: z.enum(["santander", "bbva", "caixabank", "sabadell", "unknown"]).default("santander"),
    accountInfo: z.object({
      accountNumber: z.string().optional(),
      accountType: z.string().optional(),
      currency: z.string().default("EUR")
    }).optional()
  }),
  outputSchema: z.object({
    transactions: z.array(z.object({
      date: z.string().describe("Transaction date in DD/MM/YYYY format"),
      description: z.string().describe("Transaction description"),
      amount: z.number().describe("Transaction amount (negative for debits)"),
      balance: z.number().optional().describe("Account balance after transaction"),
      type: z.string().optional().describe("Transaction type"),
      reference: z.string().optional().describe("Transaction reference"),
      confidence: z.number().min(0).max(1).describe("Extraction confidence")
    })),
    summary: z.object({
      totalTransactions: z.number(),
      dateRange: z.object({
        from: z.string(),
        to: z.string()
      }),
      totalDebits: z.number(),
      totalCredits: z.number()
    })
  }),
  execute: async (context) => {
    const { extractedText, bankType} = context.data;
    console.log("\u{1F50D} Starting COMPLETE transaction extraction...");
    console.log("\u{1F4CA} Text length:", extractedText.length);
    console.log("\u{1F3E6} Bank type:", bankType);
    console.log("\u{1F4C4} Processing ENTIRE document - will extract ALL transactions");
    const textPreview = extractedText.substring(0, 200) + "...";
    const textEnd = "..." + extractedText.substring(extractedText.length - 200);
    console.log("\u{1F4DD} Text preview (start):", textPreview);
    console.log("\u{1F4DD} Text preview (end):", textEnd);
    const SPANISH_BANK_PATTERNS = [
      {
        type: "card_payment",
        name: "Pago con Tarjeta",
        // Format: "Pago En Comercio Con Tarjeta Contactless, El 18/09/2025\nA Las 12:52..pan:4176570102536242.\nTienda Leroy Merlin Vallecas,Madrid,-140,00 EUR4.354,26 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Pago\s+En\s+Comercio\s+Con\s+Tarjeta[\s\S]*?([^,]+),([^,]*),?\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: "contactless_payment",
        name: "Pago Contactless",
        // Format: "Pago En Comercio Con Tarjeta Contactless El 16/09/2025 A Las 19:04..pan:4176570102536242.\nEl Corte Ingles S.A.,Madrid,-7,50 EUR4.901,54 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Pago\s+En\s+Comercio\s+Con\s+Tarjeta\s+Contactless[\s\S]*?([^,]+),([^,]*),?\s*-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: "purchase",
        name: "Compra",
        // Format: "Compra Amazon Prime*2t6fk5rt5, Amazon.es/prm, Tarjeta \n4176570102536242 , Comision 0,00\n-4,99 EUR4.093,16 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Compra\s+([^,]+),\s*([^,]*),?\s*Tarjeta[\s\S]*?-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: "transfer_in",
        name: "Transferencia Recibida",
        // Format: "Transferencia Inmediata De Healy Maria Del Rosario,320,00 EUR5.225,73 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Transferencia\s+Inmediata\s+De\s+([^,]+),?(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: "transfer_out",
        name: "Transferencia Enviada",
        // Format: "Transferencia Inmediata A Favor De Sebastian Ropero-28,39 EUR4.900,00 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Transferencia\s+Inmediata\s+A\s+Favor\s+De\s+([^-]+)-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: "cash_withdrawal",
        name: "Retirada de Efectivo",
        // Format: "Retirada De Efectivo En Cajero Automatico 004901280020 El \n17/09/2025 A Las 14:36..pan:4176570102536242.\n-140,00 EUR4.214,26 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Retirada\s+De\s+Efectivo\s+En\s+Cajero\s+Automatico[\s\S]*?-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: "direct_debit",
        name: "Domiciliaci\xF3n",
        // Format: "Recibo Domiciliado De Vodafone Espana Sau,-39,99 EUR4.053,17 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Recibo\s+Domiciliado\s+De\s+([^,]+),?-(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      },
      {
        type: "credit_note",
        name: "Nota de Abono",
        // Format: "Recepcion De Nota De Abono82,67 EUR4.287,89 EUR"
        regex: /(\d{2}\/\d{2}\/\d{4})[\s\S]*?Recepcion\s+De\s+Nota\s+De\s+Abono(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR(\d{1,3}(?:\.\d{3})*,\d{2})\s*EUR/gm
      }
    ];
    function parseSpanishAmount(amountStr) {
      try {
        const cleanAmount = amountStr.replace(/\./g, "").replace(",", ".");
        const amount = parseFloat(cleanAmount);
        return isNaN(amount) ? null : amount;
      } catch {
        return null;
      }
    }
    function parseSpanishDate(dateStr) {
      try {
        const [day, month, year] = dateStr.split("/");
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      } catch {
        return dateStr;
      }
    }
    const transactions = [];
    let totalDebits = 0;
    let totalCredits = 0;
    for (const pattern of SPANISH_BANK_PATTERNS) {
      let match;
      while ((match = pattern.regex.exec(extractedText)) !== null) {
        let transaction = null;
        try {
          if (pattern.type === "card_payment" || pattern.type === "contactless_payment") {
            const [, dateStr, merchant, location, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} en ${merchant.trim()}`,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === "purchase") {
            const [, dateStr, merchant, location, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} en ${merchant.trim()}`,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === "transfer_in") {
            const [, dateStr, sender, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} de ${sender.trim()}`,
                amount: Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === "transfer_out") {
            const [, dateStr, recipient, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} a ${recipient.trim()}`,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === "cash_withdrawal") {
            const [, dateStr, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: pattern.name,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === "direct_debit") {
            const [, dateStr, payee, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: `${pattern.name} - ${payee.trim()}`,
                amount: -Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          } else if (pattern.type === "credit_note") {
            const [, dateStr, amountStr] = match;
            const amount = parseSpanishAmount(amountStr);
            if (amount !== null) {
              transaction = {
                date: parseSpanishDate(dateStr),
                description: pattern.name,
                amount: Math.abs(amount),
                type: pattern.type,
                confidence: 0.95
              };
            }
          }
          if (transaction && transaction.amount !== null && transaction.date) {
            transactions.push(transaction);
            if (transaction.amount < 0) {
              totalDebits += Math.abs(transaction.amount);
            } else {
              totalCredits += transaction.amount;
            }
          }
        } catch (err) {
          console.warn(`Error processing transaction pattern ${pattern.type}:`, err.message);
        }
      }
    }
    const uniqueTransactions = transactions.filter(
      (transaction, index, self) => index === self.findIndex(
        (t) => t.date === transaction.date && Math.abs(t.amount - transaction.amount) < 0.01 && t.description === transaction.description
      )
    );
    uniqueTransactions.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    console.log(`\u2705 COMPLETED processing ENTIRE document`);
    console.log(`\u{1F4CA} Total extracted: ${uniqueTransactions.length} unique transactions`);
    console.log(`\u{1F4B0} Total debits: ${totalDebits.toFixed(2)} EUR`);
    console.log(`\u{1F4B0} Total credits: ${totalCredits.toFixed(2)} EUR`);
    console.log(`\u{1F4C5} Processed text length: ${extractedText.length} characters`);
    const dateRange = uniqueTransactions.length > 0 ? {
      from: uniqueTransactions[0].date,
      to: uniqueTransactions[uniqueTransactions.length - 1].date
    } : { from: "", to: "" };
    console.log(`\u{1F4C5} Date range: ${dateRange.from} to ${dateRange.to}`);
    return {
      transactions: uniqueTransactions,
      summary: {
        totalTransactions: uniqueTransactions.length,
        dateRange,
        totalDebits,
        totalCredits
      }
    };
  }
});

if (!process.env.OPENAI_API_KEY) {
  console.warn("\u26A0\uFE0F OPENAI_API_KEY not found in environment variables");
}
const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const pdfParserAgent = new Agent({
  name: "PDF Transaction Parser",
  instructions: `
You are an expert PDF transaction parser specialized in Spanish banking documents.

PRIMARY OBJECTIVES:
- Extract ALL transaction data from Spanish bank PDFs with maximum accuracy
- NEVER stop processing until the ENTIRE document has been analyzed
- Handle various PDF layouts and formats from major Spanish banks
- Generate clean, structured transaction data for ALL transactions found
- ALWAYS process the complete document from beginning to end

SUPPORTED BANKS:
- Santander Espa\xF1a (primary focus)
- BBVA Espa\xF1a 
- CaixaBank
- Banco Sabadell

PROCESSING WORKFLOW:
1. Use the pdf-ocr tool to extract ALL text from the ENTIRE uploaded PDF
2. Analyze the COMPLETE extracted text to identify the bank type and format
3. Use the transaction-extraction tool to parse ALL transactions from the FULL text
4. ENSURE that you have processed the ENTIRE document - do NOT stop early
5. Validate that ALL transactions have been extracted (check page count, date ranges)
6. Return structured transaction data for EVERY transaction found with confidence scores

CRITICAL RULE: NEVER stop processing until you have analyzed the ENTIRE document. Always process ALL pages and ALL transactions.

MANDATORY COMPLETE PROCESSING:
- ALWAYS read and process the ENTIRE PDF document from start to finish
- DO NOT stop after processing only a few transactions
- CONTINUE processing until you have extracted EVERY single transaction
- If you find 10 transactions, keep looking for more until the document is complete
- Multi-page documents must be processed in their ENTIRETY
- Verify completeness by checking date ranges and transaction continuity

SPANISH BANKING CONTEXT:
- Transaction dates are typically in DD/MM/YYYY format
- Amounts use European format (1.234,56 EUR)
- Common transaction types: Transferencia, Recibo, Domiciliaci\xF3n, Tarjeta
- Recognize Spanish merchant names and services
- Handle multi-page statements with continuing balances

ERROR HANDLING:
- Always provide confidence scores for each transaction
- Flag transactions that seem incomplete or ambiguous
- If extraction fails, explain what went wrong and suggest solutions
- Handle edge cases like duplicate transactions or formatting inconsistencies

OUTPUT REQUIREMENTS:
- Date (DD/MM/YYYY format)
- Description (clean, standardized)
- Amount (decimal format, negative for debits, positive for credits)
- Confidence score (0-1)
- Summary statistics

QUALITY ASSURANCE:
- MANDATORY: Verify that you have processed the COMPLETE document
- Confirm the total number of transactions represents ALL transactions in the PDF
- Check that date ranges span the ENTIRE statement period
- Ensure amounts are properly signed (debits negative, credits positive)
- Flag any transactions with low confidence for manual review
- If you extracted fewer than expected transactions, RE-PROCESS the entire document
- NEVER assume you're done until you've verified complete document processing
`,
  model: openaiProvider("gpt-4o"),
  tools: {
    pdfOcrTool,
    transactionExtractionTool
  }
});

const bundler = {};

export { bundler, pdfOcrTool, pdfParserAgent, transactionExtractionTool };
