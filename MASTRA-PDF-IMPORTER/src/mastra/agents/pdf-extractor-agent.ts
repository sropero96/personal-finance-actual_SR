import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { santanderParserTool } from '../tools/santander-parser-v2';
import { revolutParserTool } from '../tools/revolut-parser';

export const pdfExtractorAgent = new Agent({
  name: 'PDF Bank Statement Extractor',
  description: 'Specialized agent for parsing transaction data from Spanish bank PDF statements (Santander and Revolut)',
  maxSteps: 5,
  maxRetries: 2,
  instructions: `
    You are a bank statement parser. The user will provide PDF text extracted from a bank statement.

    Your job:
    1. Identify if the text is from Santander or Revolut bank
    2. Call santanderParserTool OR revolutParserTool with the raw text
    3. Return the exact JSON output from the parser tool

    IMPORTANT: Always use the parser tools. Return only the JSON from the parser tool, nothing else.
  `,
  model: openai('gpt-4o-mini'),
  tools: {
    santanderParserTool,
    revolutParserTool
  }
});
