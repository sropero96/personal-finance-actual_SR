// @ts-strict-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { parsePDF } from './pdf-adapter';

describe('pdf-adapter', () => {
  let fetchMock: any;

  beforeEach(() => {
    // Mock the global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error if PDF_AGENT_HTTP_URL is not configured', async () => {
    const originalEnv = process.env.PDF_AGENT_HTTP_URL;
    delete process.env.PDF_AGENT_HTTP_URL;

    // Mock fs.readFile to return fake base64 PDF content
    const fs = await import('../../../platform/server/fs');
    vi.spyOn(fs, 'readFile').mockResolvedValue(
      Buffer.from('fake-pdf-content').toString('base64'),
    );

    const result = await parsePDF('/path/to/test.pdf');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('PDF extraction failed');
    expect(result.transactions).toEqual([]);

    process.env.PDF_AGENT_HTTP_URL = originalEnv;
  });

  it('should successfully parse PDF and return transactions', async () => {
    process.env.PDF_AGENT_HTTP_URL = 'http://localhost:5055';

    const mockTransactions = [
      {
        date: '2025-08-12',
        amount: -23.45,
        description: 'AMAZON EU',
        balance: 1234.56,
      },
      {
        date: '2025-08-13',
        amount: 100.0,
        description: 'SALARY',
        balance: 1334.56,
      },
    ];

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: mockTransactions }),
    });

    // Mock fs.readFile to return fake base64 PDF content
    const fs = await import('../../../platform/server/fs');
    vi.spyOn(fs, 'readFile').mockResolvedValue(
      Buffer.from('fake-pdf-content').toString('base64'),
    );

    const result = await parsePDF('/path/to/test.pdf');

    expect(result.errors).toEqual([]);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toEqual({
      amount: -23.45,
      date: '2025-08-12',
      payee_name: 'AMAZON EU',
      imported_payee: 'AMAZON EU',
      notes: null,
    });
  });

  it('should handle HTTP errors from the agent', async () => {
    process.env.PDF_AGENT_HTTP_URL = 'http://localhost:5055';

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const fs = await import('../../../platform/server/fs');
    vi.spyOn(fs, 'readFile').mockResolvedValue(
      Buffer.from('fake-pdf-content').toString('base64'),
    );

    const result = await parsePDF('/path/to/test.pdf');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('PDF extraction failed');
    expect(result.transactions).toEqual([]);
  });

  it('should filter out transactions with invalid data', async () => {
    process.env.PDF_AGENT_HTTP_URL = 'http://localhost:5055';

    const mockTransactions = [
      {
        date: '2025-08-12',
        amount: -23.45,
        description: 'AMAZON EU',
        balance: 1234.56,
      },
      {
        // Missing date - should be filtered out
        amount: 100.0,
        description: 'INVALID',
        balance: 1334.56,
      },
      {
        date: '2025-08-13',
        // Invalid amount - should be filtered out
        amount: NaN,
        description: 'INVALID',
        balance: 1334.56,
      },
    ];

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: mockTransactions }),
    });

    const fs = await import('../../../platform/server/fs');
    vi.spyOn(fs, 'readFile').mockResolvedValue(
      Buffer.from('fake-pdf-content').toString('base64'),
    );

    const result = await parsePDF('/path/to/test.pdf');

    expect(result.errors).toEqual([]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].date).toBe('2025-08-12');
  });
});
