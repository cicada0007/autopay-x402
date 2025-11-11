# Backend Services Architecture

## Overview

The backend services for the Autopay Agent form a modular, resilient architecture built on Node.js with Express.js as the web framework. This setup enables the autonomous handling of x402 payment flows on Solana Devnet, integrating seamlessly with premium APIs like the Market Data API (for crypto prices, arbitrage signals, and sentiment) and Knowledge Data API (for AI research insights). Services are orchestrated to detect HTTP 402 Payment Required responses, parse x402 instructions, execute Phantom CASH or USDC payments, monitor balances, and retry requests—all while maintaining security through scoped permissions and encryption.

The architecture emphasizes:
- **Modularity**: Each service is a self-contained Express router or module, injectable via dependency injection (using InversifyJS for TypeScript support).
- **Resilience**: Built-in retry logic, circuit breakers (via `opossum` library), and exponential backoff for payments and network calls.
- **Data Persistence**: PostgreSQL via Prisma ORM for storing transaction ledgers, API request histories, and audit trails (supplementing the local JSON ledger for real-time debugging).
- **Blockchain Integration**: Solana/web3.js for transaction signing and confirmation, combined with Coinbase x402 SDK for facilitator verification.
- **Security**: AES-256 encryption for session tokens and keys (using `crypto` module), Devnet isolation, and ephemeral storage.
- **Deployment Readiness**: Services are Dockerized for scalability on AWS Fargate or Render, with health checks exposed via `/health` endpoints.

Services communicate internally via an event bus (using `EventEmitter` or BullMQ for async queues) to handle non-blocking operations, such as queuing payment retries. This ensures the agent can operate in configurable autonomy modes: Phase 1 (server-hosted demo), Phase 2 (interactive via API triggers), and Phase 3 (multi-API polling with prioritization).

External integrations:
- **Frontend Coordination**: Exposes RESTful APIs (e.g., `/api/v1/payments/status`) for Next.js frontend to visualize flows, logs, and on-chain status. API contracts include OpenAPI/Swagger docs at `/api-docs`.
- **Blockchain Layer**: Connects to Solana Devnet RPC (e.g., `https://api.devnet.solana.com`) and Coinbase Facilitator API for verification callbacks.
- **Premium APIs**: Simulated via Next.js routes but treated as external; services proxy requests post-payment.

## Core Services

### 1. API Detection Service (`apiDetectionService.ts`)

**Responsibility**: Monitors and intercepts outgoing requests to premium APIs, detects 402 responses, and parses x402 payment instructions (e.g., payment amount, token, facilitator endpoint from `x402-Payment` header).

**Key Features**:
- Uses Axios interceptors to hook into all HTTP requests from the agent.
- Parses JSON payloads from 402 responses, extracting Solana-compatible instructions (e.g., USDC mint address, payment hash requirements).
- Triggers payment workflow on detection, queuing the original request for retry.
- Supports multi-API monitoring in Phase 3: Polls endpoints like `/api/market-feed` (Market Data) and `/api/ai-insights` (Knowledge Data) at configurable intervals (e.g., every 5 minutes, prioritized by data freshness via TTL metadata).

**Dependencies**:
- Axios for HTTP client.
- Coinbase x402 SDK for header parsing.
- Prisma for logging detected 402 events to `ApiDetectionLog` table (schema: `{ id: ID, timestamp: DateTime, apiUrl: String, paymentInstructions: Json, status: Enum['pending', 'paid', 'failed'] }`).

**Example Endpoint** (Internal, for testing):
```
POST /internal/detect-402
Body: { url: 'https://premium-api.example.com/market-feed', headers: {} }
Response: { detected: true, instructions: { amount: 0.01, token: 'USDC', facilitator: 'coinbase-facilitator-url' } }
```

**Resilience**: Circuit breaker on API calls; if a premium API is unresponsive >3 times, it queues requests and notifies via WebSocket to frontend.

### 2. Payment Execution Service (`paymentExecutionService.ts`)

**Responsibility**: Handles autonomous payment processing using Phantom Wallet integration on Solana Devnet. Signs and submits transactions for Phantom CASH or USDC, verifies via Coinbase Facilitator, and updates audit trail.

**Key Features**:
- Requests scoped signing permissions via Phantom Session Keys (time-limited to 1 hour or 3 txns).
- Builds Solana transactions using web3.js: Transfers to facilitator address, includes payment hash for idempotency.
- Real-time balance check before execution; pauses if < threshold (e.g., 0.1 USDC) and emits "Low Balance" event.
- Up to 3 retries with exponential backoff (initial 1s, max 8s) on failures (e.g., transaction confirmation timeout).
- Verification: Polls Coinbase Facilitator API (REST) and subscribes to WebSocket for callbacks confirming payment authenticity.

**Dependencies**:
- `@solana/web3.js` for transaction construction and RPC interactions.
- Coinbase x402 SDK for facilitator integration.
- `bs58` for key encoding; `crypto` for AES-256 encrypting session tokens (stored ephemerally in Redis for sessions).
- Prisma for `Transaction` model (schema: `{ id: ID, hash: String, amount: Decimal, status: Enum['pending', 'confirmed', 'failed'], apiRequestId: ID, timestamp: DateTime }`).

**Example Workflow** (Pseudocode):
```typescript
async executePayment(instructions: x402Instructions, sessionKey: string): Promise<PaymentResult> {
  const connection = new Connection(SOLANA_DEVNET_RPC);
  const keypair = Keypair.fromSecretKey(decryptSessionKey(sessionKey)); // Ephemeral decrypt
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(instructions.facilitatorAddress),
      lamports: instructions.amount * LAMPORTS_PER_SOLDC,
    })
  );
  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
  await verifyWithFacilitator(signature, instructions); // Coinbase API call
  return { success: true, hash: signature };
}
```

**Security Notes**: Keys isolated to Devnet; no mainnet access. Failed hashes logged to prevent replays.

### 3. Retry and Resilience Service (`retryService.ts`)

**Responsibility**: Manages post-payment retries of original API requests, with fallback logic for failures. Implements circuit-breaker for network/RPC issues and queues pending operations.

**Key Features**:
- Retries API calls only after payment confirmation (via event from Payment Service).
- Handles edge cases: Payment failure (retry payment up to 3x), insufficient funds (pause and trigger top-up event), network issues (queue via BullMQ, resume on RPC restore).
- Prioritization in Phase 3: Uses a scoring system (e.g., urgency = dataFreshness / cost) for multi-API queues.
- Audit Trail: Syncs all outcomes to local JSON ledger (`./logs/transactions.json`) and PostgreSQL for persistence.

**Dependencies**:
- `opossum` for circuit breakers.
- BullMQ (Redis-backed) for queuing retries.
- Prisma for `RetryAttempt` model (schema: `{ id: ID, originalRequestId: ID, attempt: Int, backoffDelay: Int, outcome: Json }`).

**Example Endpoint** (For frontend polling):
```
GET /api/v1/retry-status/:requestId
Response: { status: 'retrying', attempts: 2, nextBackoff: 4000, queued: true }
```

### 4. Monitoring and Audit Service (`monitoringService.ts`)

**Responsibility**: Oversees agent health, balance monitoring, and comprehensive logging. Provides visibility into the x402 economy flow for debugging and compliance.

**Key Features**:
- Real-time Solana balance polling (every 30s) using web3.js `getBalance`.
- Emits events for low balance, payment successes/failures (broadcast via Socket.io to frontend).
- Maintains JSON ledger for all transactions; rotates files daily for production.
- Metrics export: Integrates Prometheus for backend metrics (e.g., payment success rate, retry frequency).

**Dependencies**:
- `socket.io` for real-time events to Next.js frontend.
- `winston` for structured logging.
- Prisma for aggregated audit queries (e.g., total payments by API type).

**Example Event Emission**:
```typescript
this.eventBus.emit('lowBalance', { wallet: publicKey, current: 0.05, threshold: 0.1 });
```

## Service Orchestration

Services are bootstrapped in `app.ts` using Express middleware:
- Routes: `/api/v1` prefix for external APIs (e.g., status, manual triggers).
- Internal orchestration: Event-driven; API Detection → Payment Execution → Retry.
- Error Handling: Global middleware catches exceptions, logs to audit, and returns 5xx with x402-compatible errors if applicable.
- Testing: Jest units for each service (e.g., mock Solana RPC); integration tests simulate full 402 → pay → retry flow.

## Future Extensibility

- Scale to full microservices (e.g., migrate Payment Service to a separate Cloudflare Worker).
- Rust Integration: For custom Solana programs (e.g., escrow for multi-party payments), callable via `@solana/web3.js`.
- Database Scaling: Prisma migrations for sharding transaction logs in high-volume Phase 3.

This architecture ensures the Autopay Agent is a robust, production-ready backend capable of demonstrating autonomous x402 payments in a decentralized Solana environment. For API contracts, refer to `openapi.yaml`; coordinate with FrontendDev for endpoint refinements.