import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';

// Import agents
import { pdfParserAgent } from './agents/pdf-parser-agent';
// import { transactionCuratorAgent } from './agents/transaction-curator-agent';

// Import workflows (will be created later)
// import { pdfToTransactionsWorkflow } from './workflows/pdf-to-transactions-workflow';

export const mastra = new Mastra({
  agents: {
    pdfParserAgent,
    // transactionCuratorAgent
  },
  storage: new LibSQLStore({
    url: 'file:mastra.db'
  }),
  workflows: {
    // pdfToTransactionsWorkflow
  }
});

export * from './agents';
export * from './tools';
// export * from './workflows'; // Commented out until we have actual workflows
