import type { Request, Response } from 'express';

import { asyncHandler } from '@middleware/asyncHandler';
import { getRecentLedger, getRecentTransactions } from '@services/logService';

export const ledgerHandler = asyncHandler(async (_req: Request, res: Response) => {
  const ledger = await getRecentLedger();
  res.json({ entries: ledger });
});

export const transactionsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const transactions = await getRecentTransactions();
  res.json({ transactions });
});

