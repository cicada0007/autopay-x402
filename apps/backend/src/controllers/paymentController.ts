import type { Request, Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '@middleware/asyncHandler';
import { executePayment, getSimulatedBalance } from '@services/paymentService';
import { facilitatorEnabled, verifyFacilitatorSignature } from '@services/facilitatorService';
import { prisma } from '@db/client';
import { appendLedgerEntry } from '@utils/ledger';

const executeSchema = z.object({
  requestId: z.string(),
  sessionId: z.string().optional()
});

export const executePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = executeSchema.parse(req.body);
  const result = await executePayment({
    requestId: payload.requestId,
    sessionId: payload.sessionId
  });

  res.status(result.status === 'confirmed' ? 200 : 202).json({
    requestId: payload.requestId,
    status: result.status,
    txHash: result.txHash,
    balance: result.balance
  });
});

export const balanceHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    balance: await getSimulatedBalance()
  });
});

export const facilitatorCallbackHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!facilitatorEnabled()) {
    res.status(503).json({ message: 'Facilitator integration disabled' });
    return;
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['x-facilitator-signature'] as string | undefined;
  const valid = verifyFacilitatorSignature(signature, rawBody);
  if (!valid) {
    res.status(401).json({ message: 'Invalid facilitator signature' });
    return;
  }

  const schema = z.object({
    txHash: z.string(),
    status: z.enum(['confirmed', 'rejected']),
    reason: z.string().optional()
  });

  const payload = schema.parse(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
  const payment = await prisma.payment.findUnique({
    where: { txHash: payload.txHash }
  });

  if (!payment) {
    res.status(404).json({ message: 'Payment not found' });
    return;
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: payload.status === 'confirmed' ? 'CONFIRMED' : 'FAILED',
      failureCode: payload.reason ?? null
    }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'PAYMENT',
    event: 'facilitator-callback',
    requestId: payment.requestId,
    paymentId: payment.id,
    txHash: payment.txHash,
    metadata: {
      status: payload.status,
      reason: payload.reason ?? null
    }
  });

  res.json(updated);
});

