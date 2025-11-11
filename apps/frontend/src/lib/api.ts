import axios from 'axios';

import type { PaymentInstructions, PremiumEndpoint, QueueTaskSummary } from '@/stores/useAgentStore';

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

const client = axios.create({
  baseURL: backendUrl,
  timeout: 10000
});

const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN;
if (adminToken) {
  client.defaults.headers.common.Authorization = `Bearer ${adminToken}`;
}

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

export interface BalanceResponse {
  balance: number;
  status: 'OK' | 'LOW' | 'ERROR' | 'UNKNOWN';
  threshold: number;
  paused: boolean;
  pauseReason: string | null;
  lastUpdated: string | null;
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
  const payload = data as Partial<BalanceResponse> & Record<string, unknown>;

  return {
    balance: typeof payload.balance === 'number' ? payload.balance : 0,
    status: (payload.status ?? 'UNKNOWN') as BalanceResponse['status'],
    threshold: typeof payload.threshold === 'number' ? payload.threshold : 0,
    paused: Boolean(payload.paused),
    pauseReason: (payload.pauseReason as string | null | undefined) ?? null,
    lastUpdated: typeof payload.lastUpdated === 'string' ? payload.lastUpdated : null
  };
}

export async function fetchQueueStatus() {
  const { data } = await client.get('/api/autonomy/queue');
  const tasks = Array.isArray(data.tasks) ? (data.tasks as Array<Record<string, unknown>>) : [];

  return tasks.map((task) => ({
    id: String(task.id ?? ''),
    endpoint: String(task.endpoint ?? ''),
    status: String(task.status ?? 'IDLE'),
    score: typeof task.score === 'number' ? task.score : Number(task.score ?? 0),
    lastScore:
      typeof task.lastScore === 'number'
        ? task.lastScore
        : task.lastScore != null
          ? Number(task.lastScore)
          : null,
    lastRunAt: task.lastRunAt ? String(task.lastRunAt) : null,
    lastSuccessAt: task.lastSuccessAt ? String(task.lastSuccessAt) : null,
    failureCount: typeof task.failureCount === 'number' ? task.failureCount : Number(task.failureCount ?? 0),
    nextRunAt: task.nextRunAt ? String(task.nextRunAt) : null,
    lastError: task.lastError ? String(task.lastError) : null
  })) as QueueTaskSummary[];
}

