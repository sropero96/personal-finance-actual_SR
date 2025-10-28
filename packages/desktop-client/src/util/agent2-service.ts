/**
 * Agent 2: Category Suggester Service
 *
 * Handles communication with the Anthropic Agent Server for AI-powered
 * category suggestions based on user's historical patterns and rules.
 *
 * Agent Server: https://actual-agent-sr.fly.dev
 * Documentation: CLAUDE.md - Agent 2: Category Suggester
 */

import {
  type CategoryEntity,
  type TransactionEntity,
} from 'loot-core/types/models';

// Agent Server configuration
// More robust detection: check hostname first (most reliable in browser)
let isProduction = false;

if (typeof window !== 'undefined') {
  const hostname = window.location.hostname;
  // Production: Fly.io deployment or any non-localhost hostname
  isProduction = hostname !== 'localhost' && hostname !== '127.0.0.1';
} else {
  // Server-side (Node.js) - use environment variable
  isProduction = process.env.NODE_ENV === 'production';
}

const AGENT_SERVER_URL = isProduction
  ? 'https://actual-agent-sr.fly.dev'
  : 'http://localhost:4000';

const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Rule format expected by Agent 2
 */
export type Agent2Rule = {
  id: string;
  conditions: Array<{
    field: string;
    op: string;
    value: string;
  }>;
  actions: Array<{
    field: string;
    value: string;
  }>;
};

/**
 * Historical transaction format for Agent 2 context
 */
export type Agent2HistoricalTransaction = {
  payeeName: string;
  categoryName: string;
  category: string; // category ID
  date: string;
  frequency?: number;
};

/**
 * Category suggestion returned by Agent 2
 */
export type Agent2Suggestion = {
  transaction_id: string;
  category: string | null; // category name
  categoryId: string | null; // category ID
  confidence: number; // 0-1
  reasoning: string;
  source: 'rule' | 'history' | 'claude' | 'error';
};

/**
 * Response from Agent 2 API
 */
export type Agent2Response = {
  success: boolean;
  suggestions: Agent2Suggestion[];
  stats: {
    total: number;
    claudeCalls: number;
    durationMs: number;
  };
  error?: string;
};

/**
 * Request parameters for Agent 2
 */
export type Agent2Request = {
  transactions: Array<{
    id: string;
    payee_name?: string;
    payee?: string;
    amount: number;
    date: string;
    notes?: string;
  }>;
  categories: Array<{
    id: string;
    name: string;
  }>;
  rules: Agent2Rule[];
  historicalTransactions: Agent2HistoricalTransaction[];
};

/**
 * Error types for better error handling
 */
export class Agent2Error extends Error {
  constructor(
    message: string,
    public type: 'network' | 'timeout' | 'server' | 'unknown',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'Agent2Error';
  }
}

/**
 * Suggest categories for transactions using Agent 2
 *
 * @param request - Transaction and context data
 * @returns Category suggestions with confidence scores
 * @throws Agent2Error if request fails
 */
export async function suggestCategories(
  request: Agent2Request,
): Promise<Agent2Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    console.log('[Agent 2 Service] Sending request:', {
      transactions: request.transactions.length,
      categories: request.categories.length,
      rules: request.rules.length,
      historical: request.historicalTransactions.length,
      url: AGENT_SERVER_URL,
    });

    const response = await fetch(`${AGENT_SERVER_URL}/api/suggest-categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Agent2Error(
        `Agent Server returned ${response.status}: ${errorText}`,
        'server',
        { status: response.status, body: errorText },
      );
    }

    const result: Agent2Response = await response.json();

    console.log('[Agent 2 Service] Response received:', {
      success: result.success,
      suggestions: result.suggestions?.length,
      claudeCalls: result.stats?.claudeCalls,
      duration: result.stats?.durationMs,
    });

    if (!result.success) {
      throw new Agent2Error(
        result.error || 'Agent 2 processing failed',
        'server',
        result,
      );
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle different error types
    if (error instanceof Agent2Error) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Agent2Error(
          'Request timed out after 30 seconds',
          'timeout',
          error,
        );
      }

      if (error.message.includes('Failed to fetch')) {
        throw new Agent2Error(
          'Could not connect to Agent Server. Please check your internet connection.',
          'network',
          error,
        );
      }
    }

    // Unknown error
    throw new Agent2Error('An unexpected error occurred', 'unknown', error);
  }
}

/**
 * Retry wrapper with exponential backoff
 *
 * @param request - Transaction and context data
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @returns Category suggestions
 */
export async function suggestCategoriesWithRetry(
  request: Agent2Request,
  maxRetries = 2,
): Promise<Agent2Response> {
  let lastError: Agent2Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await suggestCategories(request);
    } catch (error) {
      lastError = error as Agent2Error;

      // Don't retry on timeout or server errors (only network errors)
      if (lastError.type !== 'network') {
        throw lastError;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(
        `[Agent 2 Service] Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`,
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Agent2Error('Unknown error during retry', 'unknown');
}

/**
 * Check if Agent Server is available
 *
 * @returns True if server is healthy
 */
export async function checkAgentServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${AGENT_SERVER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.status === 'healthy' && data.apiKeyConfigured === true;
  } catch (error) {
    console.error('[Agent 2 Service] Health check failed:', error);
    return false;
  }
}
