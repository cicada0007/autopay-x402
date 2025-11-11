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

interface AgentState {
  autonomyPhase: 1 | 2 | 3;
  request: RequestState | null;
  balance: number;
  ledger: LedgerEntry[];
  transactions: TransactionEntry[];
  setAutonomyPhase: (phase: 1 | 2 | 3) => void;
  setRequest: (
    request: RequestState | null | ((current: RequestState | null) => RequestState | null)
  ) => void;
  setBalance: (balance: number) => void;
  setLedger: (entries: LedgerEntry[]) => void;
  setTransactions: (entries: TransactionEntry[]) => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      autonomyPhase: Number(process.env.NEXT_PUBLIC_AUTONOMY_PHASE ?? 1) as 1 | 2 | 3,
      request: null,
      balance: 0,
      ledger: [],
      transactions: [],
      setAutonomyPhase: (phase) => set({ autonomyPhase: phase }),
      setRequest: (request) =>
        set((state) => ({
          request: typeof request === 'function' ? request(state.request) : request
        })),
      setBalance: (balance) => set({ balance }),
      setLedger: (entries) => set({ ledger: entries }),
      setTransactions: (entries) => set({ transactions: entries })
    }),
    { name: 'autopay-agent-store' }
  )
);

