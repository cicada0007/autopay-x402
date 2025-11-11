import type { Request, Response } from 'express';

import { subscribe } from '@events/eventBus';
import { asyncHandler } from '@middleware/asyncHandler';
import { getQueueStatus } from '@services/schedulerService';
import { getBalanceSummary } from '@services/balanceService';
import { fetchLedger } from '@utils/ledger';
import { prisma } from '@db/client';

function sendEvent(res: Response, type: string, payload: unknown) {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export const eventStreamHandler = asyncHandler(async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  res.flushHeaders?.();

  const [queue, balance, ledgerResult, payments, balanceHistory] = await Promise.all([
    getQueueStatus(),
    getBalanceSummary(),
    fetchLedger({ limit: 50 }),
    prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25
    }),
    prisma.balanceSnapshot.findMany({
      orderBy: { recordedAt: 'desc' },
      take: 100
    })
  ]);

  sendEvent(res, 'bootstrap', {
    queue,
    balance,
    ledger: ledgerResult.entries,
    payments,
    balanceHistory: balanceHistory.reverse()
  });

  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  const unsubscribe = subscribe((event) => {
    sendEvent(res, event.type, event.payload);
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});


