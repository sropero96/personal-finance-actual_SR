/**
 * Categorization API Endpoints
 * Phase 2: Agent 2 - Category Suggester
 *
 * These endpoints provide access to user data for AI-powered category suggestions:
 * - GET /api/categories/:accountId - Get user's categories
 * - GET /api/transactions/search - Search similar transactions (exact + fuzzy)
 * - GET /api/rules/:accountId - Get active categorization rules
 */

import express from 'express';

// Import handlers from sync-server API directory
import { handleGetCategories } from './api/categories.js';
import { handleSearchTransactions } from './api/transactions.js';
import { handleGetRules } from './api/rules.js';

const router = express.Router();

// Register routes
router.get('/categories/:accountId', handleGetCategories);
router.get('/transactions/search', handleSearchTransactions);
router.get('/rules/:accountId', handleGetRules);

export const handlers = router;
