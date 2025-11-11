# ORM Models for Autopay Agent Database

This document defines the Prisma ORM schema for the PostgreSQL database used in the Autopay Agent project. The schema captures the core data entities required for tracking autonomous x402 payment flows on Solana Devnet, including transaction audits, API request retries, balance monitoring, and session management for Phantom Wallet integrations. These models support the agent's resilience features (e.g., retry logic, circuit-breaker events) and provide a structured audit trail beyond the local JSON ledger for scalable querying and analytics.

The design emphasizes:
- **Normalization**: Relations between payments, requests, and sessions to avoid data duplication.
- **Indexing**: For efficient querying on transaction hashes, timestamps, and status fields.
- **Security**: No storage of private keys; session tokens are hashed or encrypted references.
- **Extensibility**: Fields for future multi-API monitoring (Phase 3 autonomy) and Solana-specific metadata (e.g., block confirmations).
- **Integration Alignment**: Models align with BackendDev's Node.js/Express endpoints (e.g., `/api/transactions`) and FrontendDev's Next.js UI for real-time visualization via Zustand state synced to DB queries.

All models use TypeScript-compatible Prisma types. The schema is versioned for the initial demo (v1.0) and assumes PostgreSQL 15+ with UUIDs for primary keys.

## Prisma Schema Overview

The database includes the following key models:
- **AgentConfig**: Stores agent autonomy configurations (e.g., phases, thresholds) for multi-instance deployments.
- **ApiRequest**: Tracks API calls to premium endpoints (Market Data API, Knowledge Data API), including 402 detection and retries.
- **PaymentTransaction**: Logs Solana payments via Phantom CASH/USDC, with x402 instruction parsing and facilitator verification status.
- **WalletSession**: Manages scoped Phantom sessions for delegation, with time-limited access for autonomous signing.
- **BalanceRecord**: Monitors real-time balances and low-balance events for pause/top-up logic.
- **AuditEvent**: Captures resilience events (failures, retries, network issues) with circuit-breaker states.
- **LedgerEntry**: Consolidated audit trail linking all entities, extending the JSON ledger for queryable persistence.

Relations ensure traceability: e.g., a `PaymentTransaction` links to an `ApiRequest` and `WalletSession`, while `AuditEvent` references failures in payments or balances.

## Full Prisma Schema

Below is the complete `schema.prisma` definition. This should be placed in the project's `prisma/schema.prisma` file. Run `npx prisma generate` after updates and `npx prisma db push` for migrations.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model AgentConfig {
  id                  String   @id @default(cuid())
  autonomyPhase       Int      // 1: Demo (Node.js), 2: Interactive (Browser), 3: Full Multi-API
  apiEndpoints        Json     // Array of monitored APIs: e.g., [{name: "MarketData", url: "/api/market-feed", priority: 1}]
  retryThreshold      Int      @default(3) // Max retries for payments/API calls
  balanceThreshold    Float    @default(0.01) // USDC/CASH low-balance pause in SOL equivalent
  circuitBreakerTimeout Int    @default(300) // Seconds before resuming after network issue
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  // Relations
  apiRequests         ApiRequest[]
  paymentTransactions PaymentTransaction[]
  balanceRecords      BalanceRecord[]
  auditEvents         AuditEvent[]

  @@map("agent_configs")
  @@index([autonomyPhase])
}

model ApiRequest {
  id               String             @id @default(cuid())
  agentConfigId    String
  endpointType     String             // e.g., "MarketData" or "KnowledgeData"
  url              String
  requestPayload   Json?              // Original request body/query params
  responseStatus   Int                // e.g., 402 for payment required
  x402Instructions Json?              // Parsed x402 headers: {amount: 0.001, currency: "USDC", facilitator: "coinbase"}
  retryCount       Int                @default(0)
  maxRetries       Int                @default(3)
  isPaid           Boolean            @default(false)
  accessedData     Json?              // Post-payment response data (e.g., crypto prices, AI insights)
  failureReason    String?            // e.g., "Network timeout" or "Invalid 402 parse"
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  confirmedAt      DateTime?

  // Relations
  agentConfig      AgentConfig        @relation(fields: [agentConfigId], references: [id], onDelete: Cascade)
  payment          PaymentTransaction?
  auditEvents      AuditEvent[]

  @@map("api_requests")
  @@index([agentConfigId, endpointType])
  @@index([responseStatus, retryCount])
}

model PaymentTransaction {
  id                   String        @id @default(cuid())
  apiRequestId         String?
  agentConfigId        String
  walletSessionId      String
  transactionHash      String        @unique // Solana tx signature
  amount               Float         // In USDC/CASH (SOL equivalent)
  currency             String        // "USDC" or "CASH"
  facilitatorResponse  Json?         // Coinbase Facilitator API verification: {status: "confirmed", block: 12345}
  status               String        // "pending", "confirmed", "failed", "reverted"
  failureReason        String?       // e.g., "Insufficient funds", "RPC error"
  gasFees              Float?        // Solana fees in lamports (converted)
  blockNumber          BigInt?
  confirmations        Int           @default(0)
  isDuplicate          Boolean       @default(false) // Prevent replay attacks
  exponentialBackoff   Int?          // Retry delay in ms
  retryCount           Int           @default(0)
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt
  confirmedAt          DateTime?

  // Relations
  apiRequest           ApiRequest?   @relation(fields: [apiRequestId], references: [id])
  agentConfig          AgentConfig   @relation(fields: [agentConfigId], references: [id], onDelete: Cascade)
  walletSession        WalletSession @relation(fields: [walletSessionId], references: [id])
  balanceRecords       BalanceRecord[]
  auditEvents          AuditEvent[]

  @@map("payment_transactions")
  @@index([transactionHash])
  @@index([status, retryCount])
  @@index([agentConfigId, createdAt])
}

model WalletSession {
  id             String              @id @default(cuid())
  agentConfigId  String
  sessionToken   String              @unique // Hashed/ephemeral reference (AES-256 encrypted in runtime)
  scope          Json                // {permissions: ["sign_tx"], duration: 3600, tx_limit: 3}
  isActive       Boolean             @default(true)
  delegatedAt    DateTime            @default(now())
  expiresAt      DateTime?
  phantomAddress String              // Public key for Devnet isolation

  // Relations
  agentConfig    AgentConfig         @relation(fields: [agentConfigId], references: [id], onDelete: Cascade)
  payments       PaymentTransaction[]

  @@map("wallet_sessions")
  @@index([phantomAddress, isActive])
  @@index([expiresAt])
}

model BalanceRecord {
  id             String             @id @default(cuid())
  agentConfigId  String
  walletSessionId String
  balanceAmount  Float              // Current USDC/CASH balance in SOL equivalent
  currency       String             // "USDC" or "CASH"
  lowBalanceEvent Boolean           @default(false) // Triggered if < threshold
  topUpRequested Boolean            @default(false)
  snapshotAt     DateTime           @default(now()) // Real-time monitoring timestamp

  // Relations
  agentConfig    AgentConfig        @relation(fields: [agentConfigId], references: [id], onDelete: Cascade)
  walletSession  WalletSession      @relation(fields: [walletSessionId], references: [id])
  payments       PaymentTransaction[]

  @@map("balance_records")
  @@index([agentConfigId, snapshotAt])
  @@index([lowBalanceEvent])
}

model AuditEvent {
  id                String              @id @default(cuid())
  agentConfigId     String
  eventType         String              // e.g., "PaymentFailure", "LowBalance", "NetworkCircuitBreak", "RetrySuccess"
  relatedEntityId   String?             // ID of ApiRequest, PaymentTransaction, etc.
  entityType        String?             // e.g., "ApiRequest", "PaymentTransaction"
  details           Json                // {error: "RPC timeout", backoff: 1000, hash: "abc..."}
  severity          String              // "info", "warning", "error"
  isResolved        Boolean             @default(false)
  createdAt         DateTime            @default(now())

  // Relations
  agentConfig       AgentConfig         @relation(fields: [agentConfigId], references: [id], onDelete: Cascade)
  // Optional polymorphic relations (via details Json for flexibility)

  @@map("audit_events")
  @@index([agentConfigId, eventType, createdAt])
  @@index([severity, isResolved])
}

model LedgerEntry {
  id                    String   @id @default(cuid())
  agentConfigId         String
  transactionHash       String?  // Links to PaymentTransaction if applicable
  apiRequestId          String?
  eventSummary          Json     // Consolidated: {type: "full_flow", status: "success", data: {prices: [...], insights: {...}}}
  auditTrail            Json     // Array of AuditEvent details for this entry
  isSuccessful          Boolean  @default(false)
  createdAt             DateTime @default(now())

  // Relations
  agentConfig           AgentConfig @relation(fields: [agentConfigId], references: [id], onDelete: Cascade)
  paymentTransaction    PaymentTransaction? @relation(fields: [transactionHash], references: [transactionHash])
  apiRequest            ApiRequest?         @relation(fields: [apiRequestId], references: [id])

  @@map("ledger_entries")
  @@index([agentConfigId, createdAt])
  @@index([isSuccessful])
}
```

## Model Explanations and Usage

### AgentConfig
- **Purpose**: Centralizes agent settings for configurable autonomy (e.g., Phase 3 multi-API prioritization based on funds/data freshness).
- **Example Usage**: BackendDev queries this for runtime config: `prisma.agentConfig.findUnique({ where: { id: agentId } })`.
- **Unique to Project**: Includes `apiEndpoints` Json for dynamic monitoring of Market Data and Knowledge Data APIs.

### ApiRequest
- **Purpose**: Logs 402 detections and post-payment access to premium data (e.g., arbitrage signals or AI insights).
- **Example**: After a 402 response, create: `{ endpointType: "MarketData", x402Instructions: { amount: 0.001, currency: "USDC" } }`.
- **Retry Integration**: `retryCount` increments on failures, triggering exponential backoff via BackendDev logic.

### PaymentTransaction
- **Purpose**: Tracks Solana Devnet payments with Coinbase Facilitator verification, preventing duplicates via `transactionHash`.
- **Example**: On success: `{ status: "confirmed", facilitatorResponse: { status: "verified" }, confirmations: 32 }`.
- **Solana-Specific**: `blockNumber` and `gasFees` for on-chain observability in Next.js UI.

### WalletSession
- **Purpose**: Securely manages Phantom delegation without key storage; `scope` enforces time-limited signing for autonomy.
- **Example**: Create session: `{ scope: { tx_limit: 3, duration: 3600 }, phantomAddress: "DevnetPubkey..." }`.
- **Security Tie-In**: Aligns with AES-256 encryption; expires sessions trigger new delegations in interactive mode.

### BalanceRecord
- **Purpose**: Enables real-time monitoring and low-balance pauses; `lowBalanceEvent` fires top-up instructions.
- **Example**: Periodic cron job: `{ balanceAmount: 0.005, lowBalanceEvent: true if < threshold }`.

### AuditEvent
- **Purpose**: Captures resilience (e.g., 3 retries on payment failure, circuit-breaker on RPC issues).
- **Example**: Failure log: `{ eventType: "PaymentFailure", details: { backoff: 2000, reason: "Insufficient funds" } }`.
- **Non-Blocking**: `isResolved` tracks circuit-breaker recovery.

### LedgerEntry
- **Purpose**: Queryable extension of JSON audit trail, linking full x402 flows (request → payment → access).
- **Example**: Post-flow: `{ eventSummary: { data: { sentiment: "bullish", prices: { SOL: 150 } } }, isSuccessful: true }`.
- **Frontend Alignment**: BackendDev exposes `/api/ledger` endpoint for Zustand-synced UI visualizations.

## Migration and Seeding Notes
- **Initial Migration**: Use `npx prisma migrate dev --name init` to create tables. Add indexes for production scale.
- **Seeding**: For demo, seed with sample Devnet transactions: e.g., mock 402 requests to `/api/market-feed`.
- **Testing**: BackendDev can use Jest to test relations, e.g., `expect(transaction.apiRequest).toBeDefined()`. Postman collections for API flows should simulate DB inserts.
- **Deployment Considerations**: Set `DATABASE_URL` in Vercel/Render env vars. Use connection pooling for high-throughput agent runs.
- **Versioning**: Track changes in `prisma/migrations`. Future: Add Rust-derived Solana program IDs if extending to custom programs.

This schema ensures the DB supports the full autonomous lifecycle while complementing BackendDev's transaction handling and FrontendDev's real-time dashboards. For updates, coordinate via PRs referencing this UID: 1762841338101_autopay_agent_for_x402_autonomous_payments_on_solana__db_orm_models_md_e13sw.