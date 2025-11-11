import type { Request, Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '@middleware/asyncHandler';
import { executePayment, getSimulatedBalance } from '@services/paymentService';

const executeSchema = z.object({
  requestId: z.string()
});

export const executePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = executeSchema.parse(req.body);
  const result = await executePayment({ requestId: payload.requestId });

  res.status(result.status === 'confirmed' ? 200 : 202).json({
    requestId: payload.requestId,
    status: result.status,
    txHash: result.txHash,
    balance: result.balance
  });
});

export const balanceHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    balance: getSimulatedBalance()
  });
});

