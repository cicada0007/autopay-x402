import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PremiumEndpoint = 'market' | 'knowledge';

export interface PaymentInstructions {
  requestId: string;
  amount: number;
  currency: string;
  facilitatorUrl: string;
}

export interface RequestState {
  endpoint: PremiumEndpoint;
  status: 'idle' | 'payment-required' | 'paying' | 'fulfilled' | 'error';
  requestId?: string;
  instructions?: PaymentInstructions;
  data?: unknown;
  txHash?: string;
  error?: string;
}

export interface LedgerEntry {
  timestamp: string;
  category: string;
  event: string;
  requestId?: string;
  paymentId?: string;
  txHash?: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionEntry {
  id: string;
  requestId: string;
  txHash: string;
  currency: string;
  amount: string;
  status: string;
  confirmedAt?: string | null;
  createdAt: string;
}

export interface BalancePoint {
  timestamp: string;
  balance: number;
  status: 'OK' | 'LOW' | 'ERROR' | 'UNKNOWN';
}

export interface QueueTaskSummary {
  id: string;
  endpoint: string;
  status: string;
  score: number;
  lastScore?: number | null;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  failureCount: number;
  nextRunAt?: string | null;
  lastError?: string | null;
}

interface AgentState {
  autonomyPhase: 1 | 2 | 3;
  request: RequestState | null;
  balance: number;
  balanceStatus: 'OK' | 'LOW' | 'ERROR' | 'UNKNOWN';
  balanceThreshold: number;
  paymentsPaused: boolean;
  pauseReason: string | null;
  balanceUpdatedAt: string | null;
  ledger: LedgerEntry[];
  transactions: TransactionEntry[];
  queue: QueueTaskSummary[];
  balanceHistory: BalancePoint[];
  setAutonomyPhase: (phase: 1 | 2 | 3) => void;
  setRequest: (
    request: RequestState | null | ((current: RequestState | null) => RequestState | null)
  ) => void;
  setBalanceState: (state: {
    balance: number;
    status: 'OK' | 'LOW' | 'ERROR' | 'UNKNOWN';
    threshold: number;
    paused: boolean;
    pauseReason: string | null;
    lastUpdated: string | null;
  }) => void;
  setLedger: (entries: LedgerEntry[] | ((current: LedgerEntry[]) => LedgerEntry[])) => void;
  setTransactions: (
    entries: TransactionEntry[] | ((current: TransactionEntry[]) => TransactionEntry[])
  ) => void;
  setQueue: (tasks: QueueTaskSummary[]) => void;
  setBalanceHistory: (
    points: BalancePoint[] | ((current: BalancePoint[]) => BalancePoint[])
  ) => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      autonomyPhase: Number(process.env.NEXT_PUBLIC_AUTONOMY_PHASE ?? 1) as 1 | 2 | 3,
      request: null,
      balance: 0,
      balanceStatus: 'UNKNOWN',
      balanceThreshold: 0,
      paymentsPaused: false,
      pauseReason: null,
      balanceUpdatedAt: null,
      ledger: [],
      transactions: [],
      queue: [],
      balanceHistory: [],
      setAutonomyPhase: (phase) => set({ autonomyPhase: phase }),
      setRequest: (request) =>
        set((state) => ({
          request: typeof request === 'function' ? request(state.request) : request
        })),
      setBalanceState: (state) =>
        set({
          balance: state.balance,
          balanceStatus: state.status,
          balanceThreshold: state.threshold,
          paymentsPaused: state.paused,
          pauseReason: state.pauseReason,
          balanceUpdatedAt: state.lastUpdated
        }),
      setLedger: (entries) =>
        set((state) => ({
          ledger: typeof entries === 'function' ? entries(state.ledger) : entries
        })),
      setTransactions: (entries) =>
        set((state) => ({
          transactions: typeof entries === 'function' ? entries(state.transactions) : entries
        })),
      setQueue: (tasks) => set({ queue: tasks }),
      setBalanceHistory: (points) =>
        set((state) => ({
          balanceHistory: typeof points === 'function' ? points(state.balanceHistory) : points
        }))
    }),
    { name: 'autopay-agent-store' }
  )
);

