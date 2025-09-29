
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { pdfExtractorAgent } from './agents/pdf-extractor-agent';
import { dataCuratorAgent } from './agents/data-curator-agent';

export const mastra = new Mastra({
  agents: { pdfExtractorAgent, dataCuratorAgent },
  // NOTE: Top-level `tools` not supported in current Mastra version (CLI 0.13.x).
  // Memory & curation tools will be registered inside the upcoming Data Curator agent.
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra PDF Importer',
    level: 'info',
  }),
});
