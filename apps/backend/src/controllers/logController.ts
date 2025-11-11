import type { Request, Response } from 'express';

import { asyncHandler } from '@middleware/asyncHandler';
import { exportLedger, getRecentTransactions, queryLedger } from '@services/logService';

function parseNumberParam(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date;
}

export const ledgerHandler = asyncHandler(async (req: Request, res: Response) => {
  const limit = parseNumberParam(req.query.limit, 50, 1, 500);
  const options = {
    limit,
    cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    event: typeof req.query.event === 'string' ? req.query.event : undefined,
    requestId: typeof req.query.requestId === 'string' ? req.query.requestId : undefined,
    paymentId: typeof req.query.paymentId === 'string' ? req.query.paymentId : undefined,
    txHash: typeof req.query.txHash === 'string' ? req.query.txHash : undefined,
    from: parseDate(req.query.from),
    to: parseDate(req.query.to)
  };

  const result = await queryLedger(options);

  res.json({
    entries: result.entries,
    nextCursor: result.nextCursor,
    hasMore: Boolean(result.nextCursor)
  });
});

export const ledgerCsvHandler = asyncHandler(async (req: Request, res: Response) => {
  const limit = parseNumberParam(req.query.limit, 1000, 1, 5000);
  const options = {
    limit,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    event: typeof req.query.event === 'string' ? req.query.event : undefined,
    requestId: typeof req.query.requestId === 'string' ? req.query.requestId : undefined,
    paymentId: typeof req.query.paymentId === 'string' ? req.query.paymentId : undefined,
    txHash: typeof req.query.txHash === 'string' ? req.query.txHash : undefined,
    from: parseDate(req.query.from),
    to: parseDate(req.query.to)
  };

  const entries = await exportLedger(options);

  const headers = ['timestamp', 'category', 'event', 'requestId', 'paymentId', 'txHash', 'metadata'];
  const escapeCsv = (value: unknown) => {
    const raw = value ?? '';
    const str = typeof raw === 'string' ? raw : String(raw);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = entries.map((entry) => [
    entry.timestamp,
    entry.category,
    entry.event,
    entry.requestId ?? '',
    entry.paymentId ?? '',
    entry.txHash ?? '',
    entry.metadata ? JSON.stringify(entry.metadata) : ''
  ]);

  const csvLines = [headers.map(escapeCsv).join(','), ...rows.map((row) => row.map(escapeCsv).join(','))];
  const csv = csvLines.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ledger-export.csv"');
  res.send(csv);
});

export const transactionsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const transactions = await getRecentTransactions();
  res.json({ transactions });
});

