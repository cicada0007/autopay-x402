import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '@db/client';
import { env } from '@config/env';
import { appendLedgerEntry } from '@utils/ledger';
import { generateTxHash } from '@utils/signature';

export interface ExecutePaymentInput {
  requestId: string;
}

let walletBalance = 1.5; // Simulated Devnet balance (USDC/CASH equivalent)

export function getSimulatedBalance() {
  return walletBalance;
}

export async function executePayment({ requestId }: ExecutePaymentInput) {
  const request = await prisma.agentRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    throw Object.assign(new Error(`Request ${requestId} not found`), { status: 404 });
  }

  if (request.status === 'FULFILLED') {
    return {
      status: 'already-fulfilled' as const,
      txHash: request.paymentHash,
      balance: walletBalance
    };
  }

  if (request.status !== 'PAYMENT_REQUIRED') {
    return {
      status: 'noop' as const,
      txHash: request.paymentHash,
      balance: walletBalance
    };
  }

  const amount = Number(request.amount ?? 0);
  if (walletBalance - amount < 0) {
    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'BALANCE',
      event: 'low-balance',
      requestId,
      metadata: { amount, balance: walletBalance, threshold: env.BALANCE_THRESHOLD }
    });

    throw Object.assign(new Error('Insufficient simulated balance for payment'), { status: 402 });
  }

  walletBalance = Math.max(0, walletBalance - amount);
  const txHash = generateTxHash();

  const payment = await prisma.payment.create({
    data: {
      requestId: request.id,
      txHash,
      amount: new Decimal(amount),
      currency: request.currency,
      status: 'CONFIRMED',
      confirmedAt: new Date()
    }
  });

  await prisma.agentRequest.update({
    where: { id: request.id },
    data: { status: 'PAID', paymentHash: txHash }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'PAYMENT',
    event: 'confirmed',
    requestId: payment.requestId,
    paymentId: payment.id,
    txHash: payment.txHash,
    metadata: {
      amount,
      currency: payment.currency,
      balance: walletBalance
    }
  });

  return {
    status: 'confirmed' as const,
    txHash: payment.txHash,
    balance: walletBalance
  };
}

