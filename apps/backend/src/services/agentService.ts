import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '@db/client';
import { appendLedgerEntry } from '@utils/ledger';

type PremiumEndpoint = 'market' | 'knowledge';

interface PremiumOffering {
  endpoint: PremiumEndpoint;
  amount: number;
  currency: 'USDC' | 'CASH';
  facilitatorUrl: string;
  payload: Record<string, unknown>;
}

const premiumCatalog: Record<PremiumEndpoint, PremiumOffering> = {
  market: {
    endpoint: 'market',
    amount: 0.05,
    currency: 'USDC',
    facilitatorUrl: 'https://facilitator.devnet.coinbase.com/pay',
    payload: {
      prices: {
        SOL: 68.42,
        BTC: 46251.31,
        ETH: 2365.54
      },
      arbitrageSignals: [
        { pair: 'SOL/USDC', opportunity: '0.7%', venue: 'DEX → CEX' },
        { pair: 'BTC/USDC', opportunity: '0.3%', venue: 'CEX → CEX' }
      ],
      sentiment: {
        bullish: 0.63,
        neutral: 0.21,
        bearish: 0.16
      }
    }
  },
  knowledge: {
    endpoint: 'knowledge',
    amount: 0.03,
    currency: 'CASH',
    facilitatorUrl: 'https://facilitator.devnet.coinbase.com/insights',
    payload: {
      insights: [
        'x402 adoption is trending upward across premium APIs.',
        'Agents with autonomous retry mechanisms have 35% lower failure rates.'
      ],
      references: [
        { title: 'Solana Devnet Latency Report', url: 'https://docs.solana.com/clusters/devnet' },
        { title: 'Coinbase x402 Quickstart', url: 'https://developers.coinbase.com/docs/x402' }
      ]
    }
  }
};

export async function createOrGetRequest(
  endpoint: PremiumEndpoint,
  existingRequestId?: string
) {
  const offering = premiumCatalog[endpoint];
  if (!offering) {
    throw Object.assign(new Error(`Unknown premium endpoint: ${endpoint}`), { status: 400 });
  }

  const request =
    existingRequestId != null
      ? await prisma.agentRequest.findUnique({ where: { id: existingRequestId } })
      : null;

  if (request) {
    if (request.status === 'FULFILLED' && request.responseData) {
      const parsed = safeParseJson<Record<string, unknown>>(request.responseData);
      return {
        outcome: 'FULFILLED',
        requestId: request.id,
        data: parsed
      } as const;
    }

    if (request.status === 'PAID') {
      const fulfilled = await prisma.agentRequest.update({
        where: { id: request.id },
        data: {
          status: 'FULFILLED',
          responseData: JSON.stringify(offering.payload)
        }
      });

      await appendLedgerEntry({
        timestamp: new Date().toISOString(),
        category: 'REQUEST',
        event: 'data-fulfilled',
        requestId: fulfilled.id,
        metadata: {
          endpoint,
          amount: offering.amount,
          currency: offering.currency
        }
      });

      const payload = safeParseJson<Record<string, unknown>>(fulfilled.responseData);

      return {
        outcome: 'FULFILLED',
        requestId: fulfilled.id,
        data: payload
      } as const;
    }

    if (request.status === 'FAILED') {
      return {
        outcome: 'FAILED',
        requestId: request.id
      } as const;
    }
  }

  const created = request
    ? request
    : await prisma.agentRequest.create({
        data: {
          endpoint,
          status: 'PAYMENT_REQUIRED',
          amount: new Decimal(offering.amount),
          currency: offering.currency,
          facilitatorUrl: offering.facilitatorUrl,
          metadata: JSON.stringify({ retriesRemaining: 3 })
        }
      });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'REQUEST',
    event: 'payment-required',
    requestId: created.id,
    metadata: {
      endpoint,
      amount: offering.amount,
      currency: offering.currency
    }
  });

  return {
    outcome: 'PAYMENT_REQUIRED' as const,
    requestId: created.id,
    instructions: {
      requestId: created.id,
      endpoint,
      amount: offering.amount,
      currency: offering.currency,
      facilitatorUrl: offering.facilitatorUrl
    }
  };
}

export async function markRequestFailed(requestId: string, reason: string) {
  await prisma.agentRequest.update({
    where: { id: requestId },
    data: { status: 'FAILED', metadata: JSON.stringify({ reason }) }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'REQUEST',
    event: 'failed',
    requestId,
    metadata: { reason }
  });
}

export async function getRequestById(requestId: string) {
  return prisma.agentRequest.findUnique({ where: { id: requestId } });
}

function safeParseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (_error) {
    return null;
  }
}

