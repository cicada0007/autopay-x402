# Autopay Agent Frontend Components Library

This document serves as the comprehensive specification for the frontend component library of the Autopay Agent for x402 Autonomous Payments on Solana. Built with Next.js (App Router), React, TypeScript, TailwindCSS, and state management via Zustand, this library powers the visualization of autonomous payment flows, transaction logs, on-chain status, and real-time monitoring features. The components are designed to support the project's key requirements: demonstrating x402 economy flows with Phantom CASH payments on Solana Devnet, integrating with premium APIs (Market Data and Knowledge Data), and providing resilient, secure UI interactions for configurable autonomy modes (Demo, Interactive, and Full Autonomy).

All components adhere to the following principles:
- **Accessibility**: WCAG 2.1 AA compliant, with ARIA labels, keyboard navigation, and semantic HTML.
- **Performance**: Lazy-loaded where possible, optimized with React.memo and useMemo for re-renders in real-time updates.
- **Theming**: TailwindCSS-based dark/light mode toggle, with Solana-inspired colors (e.g., purple accents for blockchain elements, green for success states).
- **State Integration**: Zustand store for global state (e.g., wallet connection, transaction queue, balance), ensuring seamless updates across components.
- **Security**: No sensitive data (e.g., private keys) rendered; Phantom integration uses window.phantom for secure signing prompts.
- **Responsiveness**: Mobile-first design for browser-based Interactive Mode, with breakpoints for desktop dashboards in Demo/Full Autonomy views.

Components are organized into categories: Layout, Core UI, Payment & Transaction, Monitoring, and Utilities. Each spec includes props, usage examples, and integration notes specific to the x402 Solana flow.

## Layout Components

### AppLayout
A full-page wrapper providing consistent structure for the agent's UI, including header, sidebar (for logs in Full Autonomy mode), and footer with audit trail links.

**Props**:
- `children: React.ReactNode` - Content to render inside the layout.
- `sidebarOpen: boolean` - Controls sidebar visibility for log viewing.
- `autonomyMode: 'demo' | 'interactive' | 'full'` - Determines layout variants (e.g., compact for Demo Mode).
- `onModeChange: (mode: AutonomyMode) => void` - Callback for switching autonomy phases.

**Key Features**:
- Responsive sidebar with collapsible navigation to Market Data API feed, Knowledge Data API insights, and transaction queue.
- Header includes Phantom connect button and real-time Solana Devnet connection status indicator.
- Footer links to the JSON audit trail file for transparency.

**Usage Example**:
```tsx
import { AppLayout } from '@/components/layout/AppLayout';
import { useAutonomyStore } from '@/stores/autonomyStore';

function DashboardPage() {
  const { mode } = useAutonomyStore();
  return (
    <AppLayout autonomyMode={mode} onModeChange={setMode}>
      <div className="p-4">Dashboard content here</div>
    </AppLayout>
  );
}
```

**Integration Notes**: In Interactive Mode, the layout triggers Phantom session key delegation prompts via Coinbase x402 SDK. For Full Autonomy, it subscribes to WebSocket callbacks from the Facilitator API for live updates.

### HeaderNav
Top navigation bar with branding, mode selector, and quick actions (e.g., retry failed payments).

**Props**:
- `walletConnected: boolean` - Displays connect/disconnect state.
- `balance: number | null` - USDC/Phantom CASH balance from Solana/web3.js query.
- `onWalletConnect: () => void` - Triggers Phantom wallet connection.

**Key Features**:
- Mode toggle buttons styled as Solana-themed chips (e.g., "Demo" in gray, "Full" in purple).
- Low-balance warning badge if balance < 0.01 USDC, triggering pause events.

## Core UI Components

### Card
Reusable container for encapsulating API data previews or status summaries, with hover effects and loading skeletons.

**Props**:
- `title: string` - Card header text (e.g., "Market Data Feed").
- `loading: boolean` - Shows skeleton loader during API retries.
- `error?: string` - Displays error banner for 402 responses or payment failures.
- `children: React.ReactNode` - Card body content.

**Key Features**:
- TailwindCSS shadows and borders mimicking Solana transaction blocks.
- Embedded icons from Lucide React (e.g., dollar-sign for payments, chart-line for market data).

**Usage Example**:
```tsx
import { Card } from '@/components/core/Card';

<Card title="Crypto Prices" loading={isFetching}>
  <ul>
    <li>BTC: ${price}</li> {/* Fetched post-x402 payment */}
  </ul>
</Card>
```

**Integration Notes**: Used in Knowledge Data API views to display paywalled AI insights only after successful payment retry.

### Button
Customizable button with variants for primary actions (e.g., "Approve Payment"), loading states, and disabled for insufficient funds.

**Props**:
- `variant: 'primary' | 'secondary' | 'destructive'` - Styles (green for payments, red for retries).
- `loading: boolean` - Spinner animation during transaction signing.
- `disabledReason?: string` - Tooltip for disables (e.g., "Low Balance").
- `onClick: () => void` - Handles Phantom signing or API requests.

**Key Features**:
- Scoped to x402 flows: "Pay & Retry" variant auto-triggers payment + API call sequence.
- Exponential backoff visualizer: Progress bar for retry attempts (up to 3).

## Payment & Transaction Components

### PaymentFlowVisualizer
Interactive flowchart visualizing the x402 payment sequence: Detect 402 → Parse Instructions → Execute Phantom Payment → Retry API → Access Data.

**Props**:
- `flowState: 'detecting' | 'paying' | 'retrying' | 'success' | 'failed'` - Current step in the flow.
- `transactionHash?: string` - Links to Solana Explorer for Devnet txns.
- `apiEndpoint: string` - E.g., "/api/market-feed" for context.
- `onStepChange: (state: FlowState) => void` - Updates Zustand store.

**Key Features**:
- SVG-based flowchart with animated transitions (using Framer Motion) for each phase.
- Tooltips explaining x402 specifics, like "402 Response: Payment Required for Premium Crypto Prices".
- Success state renders preview data (e.g., arbitrage signals from Market Data API).

**Usage Example**:
```tsx
import { PaymentFlowVisualizer } from '@/components/payment/PaymentFlowVisualizer';
import { useTransactionStore } from '@/stores/transactionStore';

function PaymentHandler({ endpoint }: { endpoint: string }) {
  const { flowState, hash } = useTransactionStore();
  return (
    <PaymentFlowVisualizer
      flowState={flowState}
      transactionHash={hash}
      apiEndpoint={endpoint}
      onStepChange={updateFlow}
    />
  );
}
```

**Integration Notes**: Integrates with BackendDev's Next.js API routes for simulating 402 responses. In Full Autonomy, monitors multiple endpoints (Market/Knowledge) with prioritized queuing based on funds.

### TransactionModal
Modal for confirming payments, displaying x402 instructions (amount, facilitator details) before Phantom signing.

**Props**:
- `isOpen: boolean` - Controls visibility.
- `paymentDetails: { amount: number; currency: 'CASH' | 'USDC'; facilitator: string }` - Parsed from 402 header.
- `onConfirm: () => Promise<void>` - Executes Solana/web3.js transaction.
- `onCancel: () => void` - Closes and logs cancellation.

**Key Features**:
- Secure display: No keys shown; uses session tokens for delegation (1-hour limit).
- Verification badge from Coinbase Facilitator API (green check on success).
- Error handling: Retry button with backoff timer for failures.

**Integration Notes**: Scoped permissions ensure only signing access; AES-256 encrypted tokens stored ephemerally. Complements BackendDev's transaction ledger by emitting events for JSON audit updates.

## Monitoring Components

### TransactionLogViewer
Real-time log table for audit trail, showing successful/failed payments, API retries, and network events.

**Props**:
- `logs: Array<{ id: string; type: 'payment' | 'retry' | 'error'; timestamp: Date; details: object }>` - From Zustand or local JSON ledger.
- `filter: 'all' | 'success' | 'failed'` - Filters for debugging (e.g., failed hashes to prevent duplicates).
- `onExport: () => void` - Downloads JSON ledger.

**Key Features**:
- Sortable table with TailwindCSS styling; columns for Hash, Status, API Endpoint, Balance Impact.
- Circuit-breaker indicator: Red banner for RPC issues, with queue length display.
- Live updates via WebSocket from Facilitator API for on-chain confirmations.

**Usage Example**:
```tsx
import { TransactionLogViewer } from '@/components/monitoring/TransactionLogViewer';

<TransactionLogViewer
  logs={auditLogs}
  filter="failed"
  onExport={exportLedger}
/>
```

**Integration Notes**: Syncs with BackendDev's logging system; in Low Balance events, highlights entries and pauses queue visualization.

### BalanceMonitor
Compact widget showing real-time Phantom wallet balance, with alerts for thresholds.

**Props**:
- `balance: number` - Current USDC/CASH in Devnet.
- `threshold: number` - E.g., 0.01 for pause trigger.
- `onTopUp: () => void` - Opens instructions modal.

**Key Features**:
- Animated gauge (using Recharts) for balance visualization.
- Event emitter for "Low Balance" – pauses transactions and notifies user/agent.
- Currency toggle between CASH and USDC, based on x402 instructions.

**Integration Notes**: Polls Solana/web3.js every 10s; integrates with autonomy store to halt Full Mode monitoring if low.

## Utility Components

### StatusBadge
Inline badge for quick status display (e.g., "Payment Confirmed" or "API Access Granted").

**Props**:
- `status: 'pending' | 'success' | 'error' | 'paused'` - Determines color/icon.
- `text: string` - Custom label (e.g., "402 Detected").
- `tooltip?: string` - Explains context (e.g., "Retry in 2s via exponential backoff").

**Key Features**:
- Icons from Heroicons: Clock for pending, Check for success.
- Pulsing animation for real-time events like network restoration.

### LoadingSpinner
Custom spinner for async operations, themed for Solana (rotating purple orbit).

**Props**:
- `size: 'sm' | 'md' | 'lg'` - Adjusts for modals vs. full-screen.
- `message?: string` - E.g., "Executing Payment on Devnet".

**Usage**: Ubiquitous in retry logic and payment flows.

## Development Guidelines
- **Testing**: Each component has Jest unit tests for props validation and snapshot testing. Integration tests simulate Phantom mocks and 402 responses via MSW.
- **Extensibility**: Components are modular for Phase 3 multi-API support; e.g., PaymentFlowVisualizer accepts an array of endpoints.
- **Unique Identifiers**: All components include a `data-testid` prop prefixed with "autopay-" (e.g., "autopay-payment-flow") for e2e testing with Playwright.
- **Versioning**: This spec is v1.0 for hackathon demo; future updates may add Rust-based on-chain viz via Anchor IDL.
- **Coordination**: Aligns with ProductManager's UX flows (e.g., non-blocking resilience visuals) and BackendDev's API contracts (e.g., `/api/transactions` for log fetching). No direct backend calls; uses Zustand for hydrated data.

This library ensures a production-ready, intuitive UI that showcases the Autopay Agent's autonomous x402 capabilities on Solana, from detection to data access. For implementation details, refer to the source code in `/components/`. 

*Generated by FrontendDev Agent – Unique ID: 1762841338072_autopay_agent_for_x402_autonomous_payments_on_solana__frontend_components_md_yyv69w*