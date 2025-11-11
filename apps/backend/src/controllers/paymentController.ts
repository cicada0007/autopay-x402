import crypto from 'crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { asyncHandler } from '@middleware/asyncHandler';
import { executePayment } from '@services/paymentService';
import { facilitatorEnabled, verifyFacilitatorSignature } from '@services/facilitatorService';
import { prisma } from '@db/client';
import { appendLedgerEntry } from '@utils/ledger';
import { getBalanceSummary } from '@services/balanceService';
import { emitEvent } from '@events/eventBus';

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
  const summary = await getBalanceSummary();

  res.json({
    balance: summary.balance,
    status: summary.status,
    threshold: summary.threshold,
    paused: summary.paused,
    pauseReason: summary.pauseReason,
    lastUpdated: summary.lastUpdated ? summary.lastUpdated.toISOString() : null
  });
});

const RETRYABLE_PRISMA_ERROR_CODES = new Set(['P2034', 'P2028']);
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 150;

function isRetryablePrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    RETRYABLE_PRISMA_ERROR_CODES.has(error.code)
  );
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < MAX_RETRY_ATTEMPTS) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryablePrismaError(error)) {
        throw error;
      }
      attempt += 1;
      if (attempt >= MAX_RETRY_ATTEMPTS) {
        break;
      }
      await wait(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown database error');
}

export const facilitatorCallbackHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!facilitatorEnabled()) {
    res.status(503).json({ message: 'Facilitator integration disabled' });
    return;
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['x-facilitator-signature'] as string | undefined;
  const bodyHash = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'PAYMENT',
    event: 'facilitator-callback-received',
    metadata: {
      signaturePresent: Boolean(signature),
      bodyHash
    }
  });

  const valid = verifyFacilitatorSignature(signature, rawBody);
  if (!valid) {
    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'PAYMENT',
      event: 'facilitator-callback-invalid-signature',
      metadata: {
        signaturePresent: Boolean(signature),
        bodyHash
      }
    });

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
    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'PAYMENT',
      event: 'facilitator-callback-payment-missing',
      metadata: {
        txHash: payload.txHash,
        status: payload.status,
        reason: payload.reason ?? null
      }
    });

    res.status(404).json({ message: 'Payment not found' });
    return;
  }

  const targetStatus = payload.status === 'confirmed' ? 'CONFIRMED' : 'FAILED';
  const desiredFailureCode = targetStatus === 'FAILED' ? payload.reason ?? null : null;
  const alreadyProcessed =
    payment.status === targetStatus &&
    (targetStatus === 'CONFIRMED'
      ? true
      : (payment.failureCode ?? null) === desiredFailureCode);

  if (alreadyProcessed) {
    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'PAYMENT',
      event: 'facilitator-callback-duplicate',
      requestId: payment.requestId,
      paymentId: payment.id,
      txHash: payment.txHash,
      metadata: {
        status: payload.status,
        reason: payload.reason ?? null
      }
    });

    res.json(payment);
    return;
  }

  const updateData: Prisma.PaymentUpdateInput = {
    status: targetStatus,
    failureCode: desiredFailureCode,
    ...(targetStatus === 'CONFIRMED' && !payment.confirmedAt
      ? { confirmedAt: new Date() }
      : {})
  };

  let updated;

  try {
    updated = await withRetry(() =>
      prisma.payment.update({
        where: { id: payment.id },
        data: updateData
      })
    );
  } catch (error) {
    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'PAYMENT',
      event: 'facilitator-callback-update-failed',
      requestId: payment.requestId,
      paymentId: payment.id,
      txHash: payment.txHash,
      metadata: {
        status: payload.status,
        reason: payload.reason ?? null,
        error: error instanceof Error ? error.message : 'unknown'
      }
    });
    throw error;
  }

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

  emitEvent({
    type: 'payment-status',
    payload: {
      requestId: payment.requestId,
      paymentId: payment.id,
      txHash: payment.txHash,
      status: payload.status === 'confirmed' ? 'CONFIRMED' : 'FAILED',
      failureCode: payload.reason ?? null,
      amount: Number(updated.amount),
      currency: updated.currency
    }
  });

  res.json(updated);
});

