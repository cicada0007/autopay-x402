# State Management in Autopay Agent Frontend

## Overview

In the Autopay Agent for x402 Autonomous Payments on Solana, the frontend is built with Next.js using the App Router, TypeScript, and TailwindCSS. State management is crucial for handling the dynamic, real-time aspects of the application, such as wallet connections, transaction flows, API interactions, and audit logs. This ensures a responsive UI for visualizing payment processes, on-chain status, and agent autonomy modes while maintaining performance in a decentralized environment.

We primarily use **Zustand** for state management due to its lightweight nature, simplicity in TypeScript integration, and seamless compatibility with Next.js client components. Zustand avoids the boilerplate of traditional Redux while supporting middleware for persistence, devtools, and async actions—ideal for our needs like real-time balance monitoring and transaction retries. For more complex scenarios (e.g., multi-API monitoring in Phase 3 autonomy), we can extend to Redux Toolkit if normalization or advanced selectors become necessary, but Zustand suffices for the core demo and interactive modes.

This setup aligns with the project's key features: scoped Phantom Wallet permissions, exponential backoff retries, low-balance events, and JSON ledger visualization. State is scoped to client-side hydration to respect Next.js server rendering, with careful handling of Solana Devnet interactions to prevent hydration mismatches.

## Installation and Setup

Install Zustand and related dependencies:

```bash
npm install zustand @zustand/middleware
npm install --save-dev @types/zustand  # For TypeScript if needed
```

For devtools integration (useful for debugging transaction flows):

```bash
npm install zustand/middleware
```

Wrap the app with Zustand providers in `app/layout.tsx` (App Router root):

```tsx
// app/layout.tsx
'use client';
import { Provider } from 'react-redux'; // Optional if using Redux later
import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // For optional log persistence

// Global store provider (can be composed per store if needed)
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Zustand doesn't require a provider by default, but for composed stores: */}
        <ZustandProvider>{children}</ZustandProvider>
      </body>
    </html>
  );
}

// Example provider component for multiple stores (in components/providers.tsx)
import { WalletStore } from '@/stores/walletStore';
import { TransactionStore } from '@/stores/transactionStore';

export function ZustandProvider({ children }: { children: React.ReactNode }) {
  return (
    <WalletStore.Provider>
      <TransactionStore.Provider>
        {children}
      </TransactionStore.Provider>
    </WalletStore.Provider>
  );
}
```

Zustand stores are created as hooks, making them easy to use in client components without prop drilling.

## Core Stores

We define modular stores using Zustand's `create` API with TypeScript interfaces. Each store focuses on a specific domain to keep the state predictable and testable. Stores are placed in `src/stores/` for organization.

### 1. Wallet Store (`stores/walletStore.ts`)

Manages Phantom Wallet connection, balance monitoring, and session delegation. This store handles real-time USDC/Phantom CASH balance checks on Solana Devnet, low-balance events, and scoped signing permissions.

```tsx
// stores/walletStore.ts
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { Connection, PublicKey } from '@solana/web3.js';
import { usePhantom } from '@/hooks/usePhantom'; // Custom hook for Phantom detection

interface WalletState {
  isConnected: boolean;
  publicKey: PublicKey | null;
  balance: number; // In lamports or tokens (e.g., USDC)
  sessionKey: string | null; // Time-limited session for autonomy
  lowBalanceThreshold: number; // Configurable, e.g., 0.01 USDC
  isLowBalance: boolean;
  connection: Connection | null;
  error: string | null;

  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  updateBalance: () => Promise<void>;
  requestSession: (scope: 'sign' | 'delegate', duration: number) => Promise<string | null>;
  triggerLowBalanceEvent: () => void;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>()(
  devtools(
    persist(
      (set, get) => ({
        isConnected: false,
        publicKey: null,
        balance: 0,
        sessionKey: null,
        lowBalanceThreshold: 0.01, // USDC equivalent
        isLowBalance: false,
        connection: null,
        error: null,

        connectWallet: async () => {
          const { phantom } = usePhantom(); // Hook provides Phantom instance
          if (!phantom) {
            set({ error: 'Phantom wallet not found' });
            return;
          }
          try {
            const resp = await phantom.connect();
            set({
              isConnected: true,
              publicKey: new PublicKey(resp.publicKey.toString()),
              connection: new Connection('https://api.devnet.solana.com'), // Devnet RPC
            });
            await get().updateBalance();
          } catch (err) {
            set({ error: 'Connection failed: ' + (err as Error).message });
          }
        },

        disconnectWallet: () => {
          // Phantom disconnect logic
          set({
            isConnected: false,
            publicKey: null,
            balance: 0,
            sessionKey: null,
            isLowBalance: false,
            error: null,
          });
        },

        updateBalance: async () => {
          const { publicKey, connection } = get();
          if (!publicKey || !connection) return;
          try {
            const balance = await connection.getBalance(publicKey);
            // Convert to USDC/Phantom CASH if needed via token accounts
            const usdcBalance = balance / 1e9; // Simplified; use @solana/spl-token for real
            set({ balance: usdcBalance });
            if (usdcBalance < get().lowBalanceThreshold) {
              set({ isLowBalance: true });
              get().triggerLowBalanceEvent();
            } else {
              set({ isLowBalance: false });
            }
          } catch (err) {
            set({ error: 'Balance fetch failed' });
          }
        },

        requestSession: async (scope, duration) => {
          // Scoped session key generation (e.g., via Phantom API)
          // Simulate: generate ephemeral key valid for duration (ms)
          const key = `session_${Date.now()}_${scope}_${duration}`;
          set({ sessionKey: key });
          return key; // In production, use Phantom's session keys
        },

        triggerLowBalanceEvent: () => {
          // Emit event for UI notification or pause autonomy
          console.log('Low Balance Event: Top-up required');
          // Could integrate with notification system
        },

        clearError: () => set({ error: null }),
      }),
      {
        name: 'wallet-storage', // Persist connection state (non-sensitive)
        partialize: (state) => ({ isConnected: state.isConnected }), // Only persist non-sensitive
      }
    ),
    { name: 'WalletStore' }
  )
);
```

**Usage Example** (in a component like `components/WalletStatus.tsx`):

```tsx
'use client';
import { useWalletStore } from '@/stores/walletStore';

export function WalletStatus() {
  const { isConnected, balance, isLowBalance, connectWallet, updateBalance } = useWalletStore();
  return (
    <div className="p-4 bg-gray-100 rounded">
      {isConnected ? (
        <p>Balance: {balance} USDC {isLowBalance && '(Low - Top-up needed)'}</p>
      ) : (
        <button onClick={connectWallet} className="btn-primary">
          Connect Phantom
        </button>
      )}
      {isConnected && <button onClick={updateBalance}>Refresh Balance</button>}
    </div>
  );
}
```

### 2. Transaction Store (`stores/transactionStore.ts`)

Handles x402 payment flows: detecting 402 responses, executing payments via Solana/web3.js, retries with exponential backoff, and facilitator verification. Integrates with Coinbase x402 API for WebSocket callbacks.

```tsx
// stores/transactionStore.ts
import { create } from 'zustand';
import { devtools, subscribeWith } from 'zustand/middleware';
import { Transaction, SystemProgram } from '@solana/web3.js';
import { useWalletStore } from './walletStore'; // Cross-store reference via getState

interface TransactionState {
  transactions: Array<{
    id: string;
    status: 'pending' | 'success' | 'failed' | 'retrying';
    hash: string;
    amount: number; // In CASH/USDC
    apiEndpoint: string; // e.g., '/api/market-feed'
    retryCount: number;
    error?: string;
    timestamp: Date;
  }>;
  isProcessing: boolean;
  circuitBreakerActive: boolean; // For network/RPC issues

  process402Payment: (endpoint: string, amount: number, instructions: any) => Promise<string | null>;
  retryTransaction: (id: string) => Promise<void>;
  updateStatus: (id: string, status: TransactionState['transactions'][0]['status'], error?: string) => void;
  activateCircuitBreaker: () => void;
  deactivateCircuitBreaker: () => void;
  clearTransactions: () => void;
}

export const useTransactionStore = create<TransactionState>()(
  subscribeWith(
    devtools((set, get) => ({
      transactions: [],
      isProcessing: false,
      circuitBreakerActive: false,

      process402Payment: async (endpoint, amount, instructions) => {
        if (get().circuitBreakerActive) {
          set({ error: 'Circuit breaker active' });
          return null;
        }
        const walletStore = useWalletStore.getState();
        if (!walletStore.isConnected || walletStore.isLowBalance) {
          set((state) => ({
            transactions: [
              ...state.transactions,
              {
                id: `tx_${Date.now()}`,
                status: 'failed',
                hash: '',
                amount,
                apiEndpoint: endpoint,
                retryCount: 0,
                error: walletStore.isLowBalance ? 'Insufficient funds' : 'Wallet not connected',
                timestamp: new Date(),
              },
            ],
          }));
          return null;
        }

        set({ isProcessing: true });
        const txId = `tx_${Date.now()}`;
        set((state) => ({
          transactions: [
            ...state.transactions,
            {
              id: txId,
              status: 'pending',
              hash: '',
              amount,
              apiEndpoint: endpoint,
              retryCount: 0,
              timestamp: new Date(),
            },
          ],
        }));

        try {
          // Simulate Solana tx with web3.js (integrate Coinbase x402 SDK)
          const connection = walletStore.connection!;
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: walletStore.publicKey!,
              toPubkey: new PublicKey(instructions.recipient), // From x402 headers
              lamports: amount * 1e9, // CASH/USDC conversion
            })
          );
          const signature = await connection.sendTransaction(tx, [/* signers */]);
          
          // Verify via Coinbase Facilitator API (REST/WebSocket)
          // Await confirmation with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Simplified

          // On success: retry API call (integrate with apiStore)
          // Trigger WebSocket callback for real-time update

          set((state) => ({
            transactions: state.transactions.map((t) =>
              t.id === txId ? { ...t, status: 'success', hash: signature } : t
            ),
          }));
          set({ isProcessing: false });
          return signature;
        } catch (err) {
          const errorMsg = (err as Error).message;
          set((state) => ({
            transactions: state.transactions.map((t) =>
              t.id === txId
                ? { ...t, status: 'failed', error: errorMsg, retryCount: 0 }
                : t
            ),
          }));
          set({ isProcessing: false });
          // Auto-retry up to 3 times
          if (get().transactions.find((t) => t.id === txId)?.retryCount! < 3) {
            await get().retryTransaction(txId);
          }
          return null;
        }
      },

      retryTransaction: async (id: string) => {
        const tx = get().transactions.find((t) => t.id === id);
        if (!tx || tx.retryCount >= 3 || tx.status === 'success') return;
        const delay = Math.pow(2, tx.retryCount) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, status: 'retrying', retryCount: t.retryCount + 1 } : t
          ),
        }));
        // Re-process with updated instructions
        await get().process402Payment(tx.apiEndpoint, tx.amount, {}); // Fetch fresh instructions
      },

      updateStatus: (id, status, error) =>
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, status, error } : t
          ),
        })),

      activateCircuitBreaker: () => {
        set({ circuitBreakerActive: true });
        // Queue pending payments
      },

      deactivateCircuitBreaker: () => set({ circuitBreakerActive: false }),

      clearTransactions: () => set({ transactions: [] }),
    }))
  )
);
```

**Usage Example** (in `components/PaymentFlow.tsx`):

```tsx
'use client';
import { useTransactionStore } from '@/stores/transactionStore';

export function PaymentFlow({ endpoint }: { endpoint: string }) {
  const { process402Payment, transactions } = useTransactionStore();
  const handle402 = () => process402Payment(endpoint, 0.05, { recipient: 'facilitator_pubkey' });

  return (
    <div>
      <button onClick={handle402} className="btn-secondary">Request Premium Data</button>
      <ul>
        {transactions.map((tx) => (
          <li key={tx.id} className={tx.status === 'success' ? 'text-green-500' : 'text-red-500'}>
            {tx.apiEndpoint}: {tx.status} (Hash: {tx.hash}) {tx.retryCount > 0 && `(Retry ${tx.retryCount})`}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 3. API Store (`stores/apiStore.ts`)

Manages interactions with premium APIs (Market Data and Knowledge Data), including 402 detection, retries post-payment, and data caching. Integrates with Next.js API routes for Devnet-hosted data.

```tsx
// stores/apiStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useTransactionStore } from './transactionStore';

interface ApiState {
  data: Record<string, any>; // Cached responses, e.g., { '/market-feed': { prices: [...] } }
  isLoading: Record<string, boolean>;
  error: Record<string, string | null>;

  fetchData: (endpoint: string) => Promise<any>;
  retryAfterPayment: (endpoint: string, txHash: string) => Promise<any>;
  clearCache: (endpoint: string) => void;
}

export const useApiStore = create<ApiState>()(
  devtools((set, get) => ({
    data: {},
    isLoading: {},
    error: {},

    fetchData: async (endpoint) => {
      const fullUrl = `/api${endpoint}`; // Next.js API route
      set((state) => ({ isLoading: { ...state.isLoading, [endpoint]: true } }));
      set((state) => ({ error: { ...state.error, [endpoint]: null } }));

      try {
        const response = await fetch(fullUrl, {
          headers: { 'User-Agent': 'AutopayAgent/1.0' }, // For agent identification
        });

        if (response.status === 402) {
          // Parse x402 headers for payment instructions
          const instructions = {
            amount: parseFloat(response.headers.get('x402-amount') || '0'),
            currency: response.headers.get('x402-currency') || 'CASH',
            recipient: response.headers.get('x402-address') || '',
          };
          const txStore = useTransactionStore.getState();
          const hash = await txStore.process402Payment(endpoint, instructions.amount, instructions);
          if (hash) {
            // Auto-retry after success
            return await get().retryAfterPayment(endpoint, hash);
          }
          throw new Error('Payment failed');
        }

        const data = await response.json();
        set((state) => ({
          data: { ...state.data, [endpoint]: data },
          isLoading: { ...state.isLoading, [endpoint]: false },
        }));
        return data;
      } catch (err) {
        set((state) => ({
          error: { ...state.error, [endpoint]: (err as Error).message },
          isLoading: { ...state.isLoading, [endpoint]: false },
        }));
        return null;
      }
    },

    retryAfterPayment: async (endpoint, txHash) => {
      // Verify payment via Coinbase Facilitator (WebSocket callback simulation)
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Await verification
      return await get().fetchData(endpoint); // Re-fetch now unlocked
    },

    clearCache: (endpoint) =>
      set((state) => ({
        data: { ...state.data, [endpoint]: undefined },
      })),
  })),
  { name: 'ApiStore' }
);
```

**Usage Example** (in `pages/MarketData.tsx` or app router page):

```tsx
'use client';
import { useApiStore } from '@/stores/apiStore';

export default function MarketDataPage() {
  const { fetchData, data, isLoading } = useApiStore();
  const loadData = () => fetchData('/market-feed'); // Triggers 402 flow if needed

  if (isLoading['/market-feed']) return <p>Loading market data...</p>;
  return (
    <div>
      <button onClick={loadData}>Fetch Crypto Prices & Arbitrage</button>
      {data['/market-feed'] && (
        <pre>{JSON.stringify(data['/market-feed'], null, 2)}</pre> // e.g., prices, sentiment
      )}
    </div>
  );
}
```

### 4. Log Store (`stores/logStore.ts`)

Visualizes the JSON audit trail for transactions, including successes, failures, and agent events. Supports filtering by status or API type.

```tsx
// stores/logStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useTransactionStore } from './transactionStore';

interface LogEntry {
  type: 'transaction' | 'balance' | 'network' | 'api';
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  details?: any; // e.g., tx hash, error
}

interface LogState {
  logs: LogEntry[];
  filter: { level?: LogEntry['level']; type?: LogEntry['type'] };

  addLog: (entry: Omit<LogEntry, 'timestamp'>) => void;
  updateFromTransactions: () => void; // Sync with transaction store
  applyFilter: (filter: Partial<LogState['filter']>) => void;
  clearLogs: () => void;
  exportLedger: () => string; // JSON export for audit
}

export const useLogStore = create<LogState>()(
  devtools(
    persist(
      (set, get) => ({
        logs: [],
        filter: {},

        addLog: (entry) =>
          set((state) => ({
            logs: [
              ...state.logs,
              { ...entry, timestamp: new Date() },
            ].filter((log) => {
              const { level, type } = get().filter;
              return (!level || log.level === level) && (!type || log.type === type);
            }),
          })),

        updateFromTransactions: () => {
          const txStore = useTransactionStore.getState();
          txStore.transactions.forEach((tx) => {
            get().addLog({
              type: 'transaction',
              level: tx.status === 'success' ? 'info' : 'error',
              message: `${tx.status} for ${tx.apiEndpoint}`,
              details: { hash: tx.hash, retries: tx.retryCount },
            });
          });
        },

        applyFilter: (filter) => set({ filter: { ...get().filter, ...filter } }),

        clearLogs: () => set({ logs: [] }),

        exportLedger: () => JSON.stringify(get().logs, null, 2),
      }),
      { name: 'log-storage' }
    ),
    { name: 'LogStore' }
  )
);
```

**Usage Example** (in `components/AuditTrail.tsx`):

```tsx
'use client';
import { useLogStore } from '@/stores/logStore';
import { useEffect } from 'react';

export function AuditTrail() {
  const { logs, addLog, updateFromTransactions, exportLedger } = useLogStore();
  useEffect(() => {
    addLog({ type: 'agent', level: 'info', message: 'Autopay Agent Initialized' });
    updateFromTransactions();
  }, []);

  return (
    <div className="max-h-96 overflow-y-auto">
      <ul>
        {logs.map((log, i) => (
          <li key={i} className={`text-${log.level}`}>
            [{log.timestamp.toISOString()}] {log.message} {log.details && JSON.stringify(log.details)}
          </li>
        ))}
      </ul>
      <button onClick={() => console.log(exportLedger())}>Export JSON Ledger</button>
    </div>
  );
}
```

## Autonomy Mode Configuration

For configurable autonomy (Phases 1-3), add a global config store or extend the wallet store:

```tsx
// In walletStore.ts extension
interface AutonomyConfig {
  mode: 'demo' | 'interactive' | 'full';
  maxConcurrentApis: number; // For Phase 3 multi-API
  priorityQueue: string[]; // APIs to monitor, e.g., ['/market-feed', '/ai-insights']
}

const useAutonomyStore = create<AutonomyConfig & { setMode: (mode: AutonomyConfig['mode']) => void }>(
  (set) => ({
    mode: 'demo',
    maxConcurrentApis: 2,
    priorityQueue: ['/market-feed'],
    setMode: (mode) => set({ mode }),
  })
);
```

Integrate in components to toggle modes, e.g., auto-fetch based on `mode === 'full'`.

## Best Practices and Integration

- **Hydration Safety**: Use `'use client'` for components consuming stores. Avoid server-side state mutations; initialize on mount.
- **Cross-Store Sync**: Use `subscribe` middleware for reactive updates, e.g., log store subscribes to transaction changes.
- **Error Handling**: Centralized in stores with user-friendly messages; integrate with Tailwind for UI feedback.
- **Performance**: Zustand's shallow equality prevents unnecessary re-renders. For large logs, implement virtualization (e.g., with `react-window`).
- **Testing**: Use Jest to mock stores:

```tsx
// __tests__/walletStore.test.ts
import { renderHook } from '@testing-library/react-hooks';
import { useWalletStore } from '@/stores/walletStore';

test('connects wallet', () => {
  const { result } = renderHook(() => useWalletStore());
  // Mock Phantom and assert state changes
});
```

- **Security**: Never persist sensitive data (e.g., session keys) to localStorage. Use ephemeral state for Devnet isolation.
- **Extensibility**: For Phase 3, add selectors for prioritization (e.g., fetch based on data freshness and funds). If scaling, migrate to Redux Toolkit for RTK Query API caching.

This state management architecture ensures the frontend remains responsive, secure, and aligned with the x402 autonomous payment flow, enabling seamless visualization of agent operations on Solana Devnet. For backend coordination, stores consume API contracts like `/api/verify-tx` from the Coinbase Facilitator integration.