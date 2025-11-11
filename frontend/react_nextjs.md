# Next.js App Router Structure for Autopay Agent Frontend

## Overview

The frontend for the Autopay Agent project is built using Next.js 14+ with the App Router paradigm, leveraging React and TypeScript for a responsive, real-time visualization layer. This structure focuses on providing an interactive dashboard for users to monitor autonomous payment flows, view transaction logs, simulate 402 Payment Required scenarios, and track Solana Devnet balances via Phantom Wallet integration. The UI emphasizes observability of the x402 economy flow: detecting premium API responses (e.g., Market Data API for crypto prices/arbitrage signals or Knowledge Data API for AI insights), executing Phantom CASH payments, and retrying API calls post-payment.

Key goals:
- **Real-time Updates**: Use Server-Sent Events (SSE) or WebSockets to stream agent events like payment retries, balance thresholds, and circuit-breaker activations.
- **User Autonomy Control**: Toggle between demo mode (server-hosted), interactive mode (browser-triggered), and full autonomy (multi-API monitoring with prioritization).
- **Security Alignment**: Scoped Phantom wallet connections for signing sessions, with ephemeral storage for sensitive data.
- **Tech Stack Integration**: TailwindCSS for styling, Zustand for lightweight state management (e.g., wallet state, logs), and TypeScript for type-safe Solana interactions via `@solana/web3.js` and `@solana/wallet-adapter-react`.

This structure ensures the frontend complements the backend (Node.js/TypeScript with Coinbase x402 SDK) by consuming REST APIs for audit trails (JSON ledger) and WebSocket callbacks from the Facilitator API. Deployment targets Vercel for seamless SSR/SSG and edge functions.

## Project Setup

To initialize the project:

1. **Create Next.js App**:
   ```
   npx create-next-app@latest autopay-frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   cd autopay-frontend
   ```

2. **Install Dependencies**:
   - Core: `@solana/web3.js`, `@solana/wallet-adapter-react`, `@solana/wallet-adapter-wallets` (for Phantom integration).
   - State/UI: `zustand` (for agent state like balance monitoring and retry queues), `react-hook-form` (for config forms), `recharts` or `nivo` (for visualizing arbitrage signals or sentiment metrics).
   - Utils: `axios` (API calls to backend), `date-fns` (timestamp formatting for logs), `@tanstack/react-query` (caching API retries).
   - Dev: `@types/node`, `typescript` (strict mode enabled).
   
   Run:
   ```
   npm install @solana/web3.js @solana/wallet-adapter-base @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets zustand react-hook-form recharts axios date-fns @tanstack/react-query
   ```

3. **Environment Variables** (`.env.local`):
   ```
   NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com  # Solana Devnet RPC
   NEXT_PUBLIC_COINBASE_FACILITATOR_API_KEY=your_key_here  # For verification callbacks (Devnet only)
   NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3001/api  # Points to Node.js backend
   WALLET_ADAPTER_NETWORK=devnet
   ```

4. **TypeScript Config** (`tsconfig.json` extensions):
   Add Solana types:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "lib": ["dom", "dom.iterable", "es6"],
       "types": ["@solana/web3.js", "@solana/wallet-adapter-react"]
     }
   }
   ```

5. **Tailwind Config** (`tailwind.config.js`): Extend with Solana-themed colors (e.g., purple for Phantom, green for successful payments).
   ```js
   module.exports = {
     theme: {
       extend: {
         colors: {
           solana: { 400: '#9945FF', 500: '#7C3AED' },
           cash: { 500: '#00D4AA' }  // Phantom CASH green
         }
       }
     }
   };
   ```

## App Router Directory Structure

The App Router (`src/app`) organizes routes as file-based segments, enabling nested layouts, loading states, and parallel routes for multi-pane views (e.g., logs alongside dashboard). Root layout handles global providers (wallet adapter, Zustand store, QueryClient).

```
src/
├── app/
│   ├── layout.tsx               # Root layout: WalletProvider, QueryProvider, ThemeProvider
│   ├── globals.css              # Tailwind imports + custom styles (e.g., Solana font)
│   ├── favicon.ico
│   ├── api/                     # API Routes (server-side, for proxying backend or SSE)
│   │   ├── agent/
│   │   │   └── events/route.ts  # POST: Stream agent events (402 detection, payment retry)
│   │   └── balance/
│   │       └── route.ts         # GET: Proxy wallet balance check
│   ├── dashboard/
│   │   ├── layout.tsx           # Nested layout for sidebar navigation
│   │   ├── page.tsx             # Main dashboard: Real-time payment flow visualization
│   │   ├── loading.tsx          # Suspense fallback for async data loads
│   │   └── autonomy/
│   │       ├── page.tsx         # Config page: Toggle autonomy phases (1-3)
│   │       └── loading.tsx
│   ├── logs/
│   │   ├── page.tsx             # Transaction audit trail viewer (JSON ledger fetch)
│   │   ├── [txHash]/            # Dynamic route for detailed tx view
│   │   │   └── page.tsx         # On-chain status, Facilitator verification
│   │   └── error.tsx            # Error boundary for log fetch failures
│   ├── simulate/
│   │   ├── page.tsx             # Interactive simulator: Trigger mock 402 from Market/Knowledge APIs
│   │   └── api-selection/       # Parallel route for selecting premium APIs
│   │       └── @api-market/page.tsx  # Market Data API sim (crypto prices, arbitrage)
│   │       └── @api-knowledge/page.tsx # Knowledge Data API sim (AI insights)
│   └── not-found.tsx            # 404 handler with redirect to dashboard
├── components/                  # Reusable UI components
│   ├── ui/                      # Primitive components (Button, Card, etc.) via shadcn/ui pattern
│   │   ├── Button.tsx
│   │   ├── PaymentStatusBadge.tsx  # Badge for payment states (pending, confirmed, failed)
│   │   └── BalanceMonitor.tsx   # Real-time USDC/CASH balance with low-threshold alerts
│   ├── wallet/                  # Phantom-specific
│   │   ├── WalletConnectButton.tsx
│   │   └── TransactionSigner.tsx  # Scoped session key handler for autonomy mode
│   ├── agent/                   # Domain-specific
│   │   ├── PaymentFlowChart.tsx  # Recharts viz of 402 detection -> payment -> retry
│   │   ├── RetryQueueTable.tsx   # Table for exponential backoff retries (up to 3)
│   │   └── AuditLogViewer.tsx    # Paginated JSON ledger display with filters
│   └── layout/                  # Shared layouts
│       └── Sidebar.tsx          # Navigation: Dashboard, Logs, Simulate, Autonomy
├── lib/                         # Utilities and configs
│   ├── utils.ts                 # Helper functions (e.g., parse x402 headers)
│   ├── api.ts                   # Axios instance for backend calls (with auth interceptors)
│   ├── solana.ts                # Web3.js wrappers: getBalance, sendTransaction (Devnet)
│   └── store.ts                 # Zustand store: agentState (balance, logs, isAutonomous)
├── hooks/                       # Custom React hooks
│   ├── useAgentEvents.ts        # useSWR or React Query for SSE streams
│   ├── usePhantomSession.ts     # Wallet adapter hook with session key delegation (1hr/3tx limit)
│   └── useRetryLogic.ts         # Hook for simulating exponential backoff in UI
├── types/                       # TypeScript definitions
│   ├── agent.ts                 # Interfaces: PaymentEvent, RetryAttempt, AuditEntry
│   └── solana.ts                # Custom types: X402Instructions, FacilitatorCallback
└── providers/                   # Context providers
    ├── WalletProvider.tsx       # Solana WalletAdapterProvider (Devnet, Phantom only)
    ├── QueryProvider.tsx        # Tanstack Query for caching API responses
    └── AgentStoreProvider.tsx   # Zustand middleware for persistence (localStorage for logs)
```

### Key Route Explanations

- **Root Layout (`app/layout.tsx`)**:
  Wraps all pages with providers. Example:
  ```tsx
  import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
  import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
  import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantoms';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { Provider } from 'zustand'; // Custom wrapper for store
  import { AgentStoreProvider } from '@/providers/AgentStoreProvider';
  import { WalletProvider as CustomWalletProvider } from '@/providers/WalletProvider';
  import './globals.css';

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: (failureCount) => Math.min(2 ** failureCount * 1000, 30000) } } // Align with agent retry logic
  });

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC!;
    const wallets = [new PhantomWalletAdapter()];

    return (
      <html lang="en">
        <body className="bg-gray-50">
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
              <CustomWalletProvider>
                <QueryClientProvider client={queryClient}>
                  <AgentStoreProvider>
                    <div className="min-h-screen flex">
                      {children}
                    </div>
                  </AgentStoreProvider>
                </QueryClientProvider>
              </CustomWalletProvider>
            </WalletProvider>
          </ConnectionProvider>
        </body>
      </html>
    );
  }
  ```

- **Dashboard (`app/dashboard/page.tsx`)**:
  Central view for live monitoring. Fetches agent state via Zustand and backend API.
  ```tsx
  'use client';
  import { useAgentState } from '@/lib/store';
  import PaymentFlowChart from '@/components/agent/PaymentFlowChart';
  import BalanceMonitor from '@/components/ui/BalanceMonitor';

  export default function Dashboard() {
    const { balance, recentPayments, isAutonomous } = useAgentState();
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-solana-500">Autopay Agent Dashboard</h1>
        <BalanceMonitor balance={balance} threshold={0.01} /> {/* USDC Devnet threshold */}
        <PaymentFlowChart data={recentPayments} /> {/* Viz: 402 -> Pay (CASH) -> Retry */}
        {isAutonomous && <p className="text-green-600">Full Autonomy: Monitoring Market & Knowledge APIs</p>}
      </div>
    );
  }
  ```

- **Logs (`app/logs/page.tsx`)**:
  Displays JSON ledger with filters for successes/failures (e.g., payment failures, low balance events).
  Uses dynamic segments for tx details, integrating Solana explorer links for Devnet txHashes.

- **Simulate (`app/simulate/page.tsx`)**:
  Interactive form to mock API requests (e.g., `/api/market-feed`), triggering 402 responses. Parallel routes (`@api-market`, `@api-knowledge`) allow side-by-side simulations without full page reloads.

- **API Routes (`app/api/...`)**:
  Server-side handlers for security-sensitive ops, like proxying wallet signatures or streaming Facilitator WebSocket events to avoid exposing keys client-side.

## State Management with Zustand

Central store in `src/lib/store.ts` for agent-specific state, ensuring reactivity across components:
```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // For localStorage audit persistence

interface AgentState {
  balance: number; // USDC/CASH in lamports
  logs: AuditEntry[]; // From JSON ledger
  isAutonomous: boolean; // Phase 1-3 toggle
  retries: RetryAttempt[];
  setBalance: (bal: number) => void;
  addLog: (entry: AuditEntry) => void;
  toggleAutonomy: (phase: 1 | 2 | 3) => void;
}

export const useAgentState = create<AgentState>()(
  persist(
    (set, get) => ({
      balance: 0,
      logs: [],
      isAutonomous: false,
      retries: [],
      setBalance: (bal) => set({ balance: bal }),
      addLog: (entry) => set((state) => ({ logs: [...state.logs, entry] })),
      toggleAutonomy: (phase) => {
        // Logic for phase-specific behavior, e.g., enable multi-API for phase 3
        set({ isAutonomous: phase === 3 });
      },
    }),
    { name: 'autopay-agent-state' }
  )
);
```

## Solana and Backend Integration

- **Phantom Wallet Hook** (`src/hooks/usePhantomSession.ts`): Requests scoped permissions (signTransaction only). For autonomy, generates session keys valid for 1 hour/3 txs, encrypted in memory.
- **API Calls** (`src/lib/api.ts`): Axios base with interceptors for x402 header parsing and error handling (e.g., 402 triggers payment flow).
  Example: Fetch market data with retry:
  ```ts
  import axios from 'axios';
  const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_BACKEND_API_URL });

  export const fetchPremiumData = async (endpoint: 'market' | 'knowledge') => {
    try {
      const { data } = await api.get(`/${endpoint}-feed`, { headers: { 'Accept': 'application/json' } });
      return data; // Prices, signals, or AI insights post-payment
    } catch (error: any) {
      if (error.response?.status === 402) {
        // Trigger payment via store action
        useAgentState.getState().handle402Payment(error.response.headers['x402-instructions']);
      }
      throw error;
    }
  };
  ```

- **Real-time Events**: Use `app/api/agent/events/route.ts` for SSE:
  ```ts
  // server-side
  import { NextRequest } from 'next/server';

  export async function GET(req: NextRequest) {
    const stream = new ReadableStream({
      start(controller) {
        // Proxy backend WebSocket for Facilitator callbacks
        const backendStream = fetch(`${process.env.BACKEND_API_URL}/events`).then(res => res.body);
        // Pipe events: { type: 'payment-confirmed', txHash: '...', data: { price: 150.5 } }
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      }
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }
  ```

## Testing and Deployment

- **Unit Tests** (`__tests__/dashboard.test.tsx`): Use `@testing-library/react` and `msw` for mocking Solana connections and API 402 responses.
  Example: Simulate low balance event triggering pause.
- **E2E**: Cypress for flows like connect wallet -> simulate 402 -> approve payment -> view retry success.
- **Deployment**: Vercel CLI (`vercel --prod`). Use edge middleware for auth (e.g., verify session keys). Ensure Devnet isolation—no mainnet exposure.

This structure provides a scalable, observable frontend tailored to the Autopay Agent's x402 flows, enabling developers to demo autonomous Solana payments while maintaining security and resilience. For extensibility, parallel routes can expand to more API categories without refactoring.