import type { Request, Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '@middleware/asyncHandler';
import { createOrGetRequest, getRequestById, markRequestFailed } from '@services/agentService';

const requestSchema = z.object({
  endpoint: z.enum(['market', 'knowledge']),
  requestId: z.string().optional()
});

export const requestPremiumHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = requestSchema.parse(req.body);
  const result = await createOrGetRequest(parsed.endpoint, parsed.requestId);

  if (result.outcome === 'PAYMENT_REQUIRED') {
    res
      .status(402)
      .setHeader('Payment-Network', 'solana-devnet')
      .setHeader('Payment-Methods', result.instructions.currency)
      .setHeader('Payment-Facilitator', result.instructions.facilitatorUrl)
      .json({
        requestId: result.requestId,
        amount: result.instructions.amount,
        currency: result.instructions.currency,
        facilitatorUrl: result.instructions.facilitatorUrl
      });
    return;
  }

  if (result.outcome === 'FAILED') {
    res.status(409).json({ requestId: result.requestId, status: 'failed' });
    return;
  }

  res.json({
    requestId: result.requestId,
    status: 'fulfilled',
    data: result.data
  });
});

const statusSchema = z.object({
  requestId: z.string()
});

export const requestStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { requestId } = statusSchema.parse(req.params);
  const request = await getRequestById(requestId);
  if (!request) {
    res.status(404).json({ requestId, status: 'not-found' });
    return;
  }

  const endpoint = request.endpoint as 'market' | 'knowledge';
  const outcome = await createOrGetRequest(endpoint, requestId);

  if (outcome.outcome === 'PAYMENT_REQUIRED') {
    res.status(202).json({ requestId, status: 'payment-required' });
    return;
  }

  if (outcome.outcome === 'FAILED') {
    res.status(409).json({ requestId, status: 'failed' });
    return;
  }

  res.json({ requestId, status: 'fulfilled', data: outcome.data });
});

const failureSchema = z.object({
  requestId: z.string(),
  reason: z.string().min(3)
});

export const requestFailureHandler = asyncHandler(async (req: Request, res: Response) => {
  const { requestId, reason } = failureSchema.parse(req.body);
  await markRequestFailed(requestId, reason);
  res.status(200).json({ requestId, status: 'failed', reason });
});

