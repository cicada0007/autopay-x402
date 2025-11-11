import axios from 'axios';

import type { PaymentInstructions, PremiumEndpoint } from '@/stores/useAgentStore';

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

const client = axios.create({
  baseURL: backendUrl,
  timeout: 10000
});

export interface RequestPremiumResponse {
  requestId: string;
  data?: unknown;
}

export async function requestPremiumData(
  endpoint: PremiumEndpoint,
  requestId?: string
): Promise<{ status: 'fulfilled'; data: RequestPremiumResponse } | { status: 'payment-required'; instructions: PaymentInstructions }> {
  try {
    const { data } = await client.post<RequestPremiumResponse>('/api/agent/request', {
      endpoint,
      requestId
    });

    return {
      status: 'fulfilled',
      data
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 402) {
      const body = error.response.data as PaymentInstructions;
      return {
        status: 'payment-required',
        instructions: body
      };
    }

    throw error;
  }
}

export async function executePayment(requestId: string) {
  const { data } = await client.post('/api/payments/execute', { requestId });
  return data as { status: string; txHash?: string; balance: number };
}

export async function fetchLedger() {
  const { data } = await client.get('/api/logs/ledger');
  return data.entries as Array<Record<string, unknown>>;
}

export async function fetchTransactions() {
  const { data } = await client.get('/api/logs/transactions');
  return data.transactions as Array<Record<string, unknown>>;
}

export async function fetchBalance() {
  const { data } = await client.get('/api/payments/balance');
  return data.balance as number;
}

