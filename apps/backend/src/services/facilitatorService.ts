import crypto from 'crypto';

import axios from 'axios';

import { env } from '@config/env';
import { appendLedgerEntry } from '@utils/ledger';

export interface FacilitatorSubmission {
  requestId: string;
  paymentId: string;
  txHash: string;
  amount: number;
  currency: string;
  endpoint: string;
}

export interface FacilitatorCallbackBody {
  txHash: string;
  status: 'confirmed' | 'rejected';
  reason?: string;
  metadata?: Record<string, unknown>;
}

export function facilitatorEnabled() {
  return Boolean(env.COINBASE_FACILITATOR_API_KEY && env.COINBASE_FACILITATOR_BASE_URL);
}

export async function submitFacilitatorVerification(payload: FacilitatorSubmission) {
  if (!facilitatorEnabled()) {
    return;
  }

  try {
    await axios.post(
      `${env.COINBASE_FACILITATOR_BASE_URL}/payments/verify`,
      {
        txHash: payload.txHash,
        amount: payload.amount,
        currency: payload.currency,
        endpoint: payload.endpoint,
        requestId: payload.requestId
      },
      {
        headers: {
          Authorization: `Bearer ${env.COINBASE_FACILITATOR_API_KEY}`
        },
        timeout: 10_000
      }
    );

    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'PAYMENT',
      event: 'facilitator-submitted',
      requestId: payload.requestId,
      paymentId: payload.paymentId,
      txHash: payload.txHash
    });
  } catch (error) {
    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'PAYMENT',
      event: 'facilitator-submit-failed',
      requestId: payload.requestId,
      paymentId: payload.paymentId,
      txHash: payload.txHash,
      metadata: {
        error: error instanceof Error ? error.message : 'unknown'
      }
    });
    throw error;
  }
}

export function verifyFacilitatorSignature(signature: string | undefined, body: string) {
  if (!env.COINBASE_FACILITATOR_SECRET) {
    return false;
  }

  if (!signature) {
    return false;
  }

  const computed = crypto
    .createHmac('sha256', env.COINBASE_FACILITATOR_SECRET)
    .update(body, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(computed, 'hex'));
}

