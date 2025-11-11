# Database Schema Design for Autopay Agent

## Overview

This document outlines the database schema for the Autopay Agent project, a web application demonstrating autonomous x402 payment flows on Solana Devnet. The schema is designed using PostgreSQL as the primary database, integrated with Prisma ORM for type-safe queries and migrations in a TypeScript/Node.js backend environment. The design supports the core requirements of tracking API interactions, payment executions, retry mechanisms, balance monitoring, and audit trails, while ensuring resilience in decentralized environments.

Key design principles:
- **Normalization**: Entities are normalized to 3NF to minimize redundancy, with denormalized views for performance in high-frequency transaction logging.
- **Scalability**: Supports high-throughput logging of Solana transactions and API retries, with partitioning recommendations for large-scale audit trails.
- **Security**: Sensitive fields (e.g., session tokens, private key hashes) are encrypted at rest using Prisma's middleware or pg_crypto extension. All tables include audit timestamps and user/agent identifiers.
- **Resilience Integration**: Tables capture exponential backoff retries, circuit-breaker states, and low-balance events to enable non-blocking autonomous operations.
- **x402 Specificity**: Custom fields for parsing 402 Payment Required responses, including payment instructions (e.g., amount, currency like Phantom CASH or USDC, facilitator details).
- **Devnet Focus**: All transaction data is scoped to Solana Devnet; mainnet fields are reserved for future extensibility.

The schema supports the project's phases:
- **Phase 1 (Demo Mode)**: Server-hosted logging of autonomous API requests and payments.
- **Phase 2 (Interactive Mode)**: Browser-based tracking with real-time balance queries.
- **Phase 3 (Full Autonomy)**: Multi-API monitoring with prioritization queries based on funds and data freshness.

Estimated data volume: Up to 10,000 transactions per demo session, with JSONB fields for flexible storage of Solana transaction metadata.

## Entity-Relationship Diagram (Text-Based)

```
[Agent] 1---M [ApiRequest] 1---M [Payment] 1---M [TransactionLog]
 |                  |                  |
 M                  M                  M
[WalletBalance]    [RetryAttempt]    [AuditEvent]
                       |
                       M
                  [ErrorClassification]
```

- **Agent**: Represents autonomous agents or user sessions.
- **ApiRequest**: Tracks 402-triggered requests to premium APIs (e.g., Market Data, Knowledge Data).
- **Payment**: Handles x402 payment instructions and executions via Phantom wallet.
- **TransactionLog**: Detailed Solana transaction records with verification.
- **WalletBalance**: Real-time monitoring for Phantom CASH/USDC.
- **RetryAttempt**: Manages up to 3 retries with backoff.
- **AuditEvent**: Comprehensive ledger for all events (success/failure).
- **ErrorClassification**: Categorizes failures (e.g., insufficient funds, network issues).

## Table Definitions

Below are the PostgreSQL table definitions, followed by Prisma schema equivalents. All tables include:
- `id`: UUID primary key (auto-generated).
- `created_at`, `updated_at`: Timestamps with timezone.
- `agent_id`: Foreign key to Agent table for multi-agent support.

### 1. Agents Table
Stores agent instances (e.g., demo mode processes, browser extensions).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique agent identifier. |
| name | VARCHAR(100) | NOT NULL, UNIQUE | Agent name (e.g., "DemoAutopayAgent"). |
| autonomy_level | ENUM('PHASE1', 'PHASE2', 'PHASE3') | NOT NULL | Configurable autonomy (server, interactive, full). |
| wallet_address | VARCHAR(44) | NOT NULL | Phantom wallet public key (Solana base58). |
| session_token_hash | BYTEA | NULL | AES-256 encrypted hash of session key for delegation. |
| is_active | BOOLEAN | DEFAULT true | Agent status for circuit-breaker logic. |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp. |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp. |

**Prisma Schema Snippet**:
```prisma
model Agent {
  id                String   @id @default(cuid())
  name              String   @unique
  autonomyLevel     AutonomyLevel
  walletAddress     String   @unique
  sessionTokenHash  Unsupported("bytea")?
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  apiRequests       ApiRequest[]
  payments          Payment[]
  walletBalances    WalletBalance[]
  // ... other relations

  @@map("agents")
}

enum AutonomyLevel {
  PHASE1
  PHASE2
  PHASE3
}
```

### 2. ApiRequests Table
Captures incoming API calls to premium endpoints (e.g., /api/market-feed for crypto prices).

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Request ID. |
| agent_id | UUID | FK to agents(id), NOT NULL | Owning agent. |
| endpoint | VARCHAR(255) | NOT NULL | API path (e.g., "/api/market-feed"). |
| api_type | ENUM('MARKET_DATA', 'KNOWLEDGE_DATA') | NOT NULL | Category (crypto prices/arbitrage vs. AI insights). |
| http_status | INTEGER | NOT NULL | Response code (e.g., 402). |
| x402_instructions | JSONB | NULL | Parsed x402 headers (e.g., { "amount": 0.01, "currency": "CASH", "facilitator": "coinbase" }). |
| request_payload | JSONB | NULL | Original request body (e.g., query params for sentiment metrics). |
| response_headers | JSONB | NULL | Full headers for 402 parsing. |
| data_accessed | JSONB | NULL | Premium data post-retry (e.g., arbitrage signals). |
| status | ENUM('PENDING', 'PAYMENT_REQUIRED', 'PAID', 'FAILED', 'ACCESSED') | DEFAULT 'PENDING' | Request lifecycle. |
| created_at | TIMESTAMPTZ | DEFAULT now() | Timestamp. |

**Indexes**: Composite on `agent_id + endpoint` for multi-API monitoring queries.

**Prisma Snippet**:
```prisma
model ApiRequest {
  id                 String      @id @default(cuid())
  agentId            String
  endpoint           String
  apiType            ApiType
  httpStatus         Int
  x402Instructions   Json?
  requestPayload     Json?
  responseHeaders    Json?
  dataAccessed       Json?
  status             RequestStatus @default(PENDING)
  createdAt          DateTime    @default(now())
  agent              Agent       @relation(fields: [agentId], references: [id], onDelete: Cascade)
  payments           Payment[]
  retryAttempts      RetryAttempt[]

  @@index([agentId, endpoint])
  @@map("api_requests")

  enum ApiType {
    MARKET_DATA
    KNOWLEDGE_DATA
  }

  enum RequestStatus {
    PENDING
    PAYMENT_REQUIRED
    PAID
    FAILED
    ACCESSED
  }
}
```

### 3. Payments Table
Tracks x402 payment executions using Phantom CASH/USDC on Solana Devnet.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Payment ID. |
| api_request_id | UUID | FK to api_requests(id), NOT NULL | Triggering request. |
| agent_id | UUID | FK to agents(id), NOT NULL | Owning agent. |
| amount | DECIMAL(18,9) | NOT NULL | Payment amount (e.g., 0.001 CASH). |
| currency | ENUM('CASH', 'USDC') | NOT NULL | Token type. |
| facilitator_url | VARCHAR(255) | NULL | Coinbase Facilitator API endpoint. |
| payment_hash | VARCHAR(88) | UNIQUE, NULL | Solana transaction signature (base58). |
| status | ENUM('INITIATED', 'SIGNED', 'CONFIRMED', 'VERIFIED', 'FAILED') | DEFAULT 'INITIATED' | Payment flow status. |
| verification_callback | JSONB | NULL | WebSocket/REST response from Facilitator API. |
| created_at | TIMESTAMPTZ | DEFAULT now() | Timestamp. |

**Prisma Snippet**:
```prisma
model Payment {
  id                    String         @id @default(cuid())
  apiRequestId          String
  agentId               String
  amount                Decimal
  currency              PaymentCurrency
  facilitatorUrl        String?
  paymentHash           String?        @unique
  status                PaymentStatus  @default(INITIATED)
  verificationCallback  Json?
  createdAt             DateTime       @default(now())
  apiRequest            ApiRequest     @relation(fields: [apiRequestId], references: [id])
  agent                 Agent          @relation(fields: [agentId], references: [id])
  transactionLogs       TransactionLog[]
  retryAttempts         RetryAttempt[]

  @@index([paymentHash])
  @@map("payments")

  enum PaymentCurrency {
    CASH
    USDC
  }

  enum PaymentStatus {
    INITIATED
    SIGNED
    CONFIRMED
    VERIFIED
    FAILED
  }
}
```

### 4. TransactionLogs Table
Detailed audit for Solana transactions, replacing the "local JSON ledger" with structured storage.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Log ID. |
| payment_id | UUID | FK to payments(id), NOT NULL | Linked payment. |
| solana_tx_metadata | JSONB | NOT NULL | Full web3.js transaction details (e.g., blockhash, signatures). |
| confirmation_status | ENUM('PROCESSED', 'CONFIRMED', 'FINALIZED') | NOT NULL | Solana confirmation level. |
| gas_fees | DECIMAL(18,9) | NULL | Transaction fees in lamports. |
| is_duplicate | BOOLEAN | DEFAULT false | Flag for prevented duplicates. |
| error_message | TEXT | NULL | Failure details (e.g., "RPC timeout"). |
| created_at | TIMESTAMPTZ | DEFAULT now() | Timestamp. |

**Indexes**: On `payment_id + created_at` for time-series queries.

**Prisma Snippet**:
```prisma
model TransactionLog {
  id                   String   @id @default(cuid())
  paymentId            String
  solanaTxMetadata     Json
  confirmationStatus   ConfirmationStatus
  gasFees              Decimal?
  isDuplicate          Boolean  @default(false)
  errorMessage         String?
  createdAt            DateTime @default(now())
  payment              Payment  @relation(fields: [paymentId], references: [id])

  @@index([paymentId, createdAt(sort: Desc)])
  @@map("transaction_logs")

  enum ConfirmationStatus {
    PROCESSED
    CONFIRMED
    FINALIZED
  }
}
```

### 5. WalletBalances Table
Monitors real-time balances for low-balance events.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Balance ID. |
| agent_id | UUID | FK to agents(id), NOT NULL | Owning agent. |
| wallet_address | VARCHAR(44) | NOT NULL | Phantom address. |
| balance_cash | DECIMAL(18,9) | DEFAULT 0 | Phantom CASH balance. |
| balance_usdc | DECIMAL(18,9) | DEFAULT 0 | USDC balance on Devnet. |
| threshold | DECIMAL(18,9) | NOT NULL | Low-balance threshold (e.g., 0.01). |
| last_checked | TIMESTAMPTZ | NOT NULL | Last balance query time. |
| low_balance_event | BOOLEAN | DEFAULT false | Trigger for top-up instructions. |
| created_at | TIMESTAMPTZ | DEFAULT now() | Timestamp. |

**Prisma Snippet**:
```prisma
model WalletBalance {
  id                String   @id @default(cuid())
  agentId           String
  walletAddress     String
  balanceCash       Decimal  @default(0)
  balanceUsdc       Decimal  @default(0)
  threshold         Decimal
  lastChecked       DateTime
  lowBalanceEvent   Boolean  @default(false)
  createdAt         DateTime @default(now())
  agent             Agent    @relation(fields: [agentId], references: [id])

  @@unique([agentId, walletAddress])
  @@map("wallet_balances")
}
```

### 6. RetryAttempts Table
Handles retry logic for payments and API calls.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Attempt ID. |
| api_request_id | UUID | FK to api_requests(id), NULL | Linked request (for API retries). |
| payment_id | UUID | FK to payments(id), NULL | Linked payment (for tx retries). |
| attempt_number | INTEGER | NOT NULL, CHECK (attempt_number <= 3) | Retry count (1-3). |
| backoff_delay | INTERVAL | NOT NULL | Exponential backoff (e.g., 1s, 2s, 4s). |
| outcome | ENUM('SUCCESS', 'FAILURE') | NOT NULL | Result of attempt. |
| created_at | TIMESTAMPTZ | DEFAULT now() | Timestamp. |

**Prisma Snippet**:
```prisma
model RetryAttempt {
  id             String      @id @default(cuid())
  apiRequestId   String?
  paymentId      String?
  attemptNumber  Int
  backoffDelay   Unsupported("interval")
  outcome        RetryOutcome
  createdAt      DateTime    @default(now())
  apiRequest     ApiRequest? @relation(fields: [apiRequestId], references: [id])
  payment        Payment?    @relation(fields: [paymentId], references: [id])

  @@index([apiRequestId])
  @@index([paymentId])
  @@map("retry_attempts")

  enum RetryOutcome {
    SUCCESS
    FAILURE
  }
}
```

### 7. AuditEvents Table
Overarching ledger for all events, including circuit-breakers and errors.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Event ID. |
| agent_id | UUID | FK to agents(id), NOT NULL | Owning agent. |
| event_type | ENUM('PAYMENT_SUCCESS', 'PAYMENT_FAILURE', 'LOW_BALANCE', 'NETWORK_ISSUE', 'CIRCUIT_BREAKER', 'API_ACCESS') | NOT NULL | Event category. |
| related_id | UUID | NULL | FK to related entity (e.g., payment_id). |
| details | JSONB | NULL | Additional context (e.g., error classification, queued payments). |
| severity | ENUM('INFO', 'WARNING', 'ERROR') | DEFAULT 'INFO' | Log level. |
| created_at | TIMESTAMPTZ | DEFAULT now() | Timestamp. |

**Indexes**: Time-series on `agent_id + created_at`; full-text search on `details` for debugging.

**Prisma Snippet**:
```prisma
model AuditEvent {
  id         String     @id @default(cuid())
  agentId    String
  eventType  AuditEventType
  relatedId  String?
  details    Json?
  severity   AuditSeverity @default(INFO)
  createdAt  DateTime   @default(now())
  agent      Agent      @relation(fields: [agentId], references: [id])

  @@index([agentId, createdAt(sort: Desc)])
  @@map("audit_events")

  enum AuditEventType {
    PAYMENT_SUCCESS
    PAYMENT_FAILURE
    LOW_BALANCE
    NETWORK_ISSUE
    CIRCUIT_BREAKER
    API_ACCESS
  }

  enum AuditSeverity {
    INFO
    WARNING
    ERROR
  }
}
```

## Relations and Constraints
- **Cascading Deletes**: OnDelete: Cascade for child tables (e.g., deleting an ApiRequest removes linked Payments).
- **Foreign Keys**: All enforced with ON DELETE RESTRICT for audit integrity.
- **Unique Constraints**: Prevent duplicate payments via `payment_hash`.
- **Triggers**: PostgreSQL trigger to update `updated_at` on all tables; another for encrypting `session_token_hash` on insert.

## Indexes and Performance
- **Primary Indexes**: As defined per table.
- **Composite Indexes**:
  - ApiRequest: `[agent_id, status, created_at]` for pending request prioritization in Phase 3.
  - AuditEvent: `[event_type, severity, created_at DESC]` for real-time dashboard queries.
  - WalletBalance: `[agent_id, last_checked]` for balance monitoring cron jobs.
- **Partitioning**: Recommend partitioning AuditEvents and TransactionLogs by `created_at` (monthly) for >1M rows.
- **Query Optimization**: Use JSONB for flexible fields (e.g., x402_instructions) with GIN indexes: `CREATE INDEX ON api_requests USING GIN (x402_instructions);`.

## Migrations and Prisma Integration
- **Initial Migration**: Run `npx prisma migrate dev --name init` after defining schema.prisma with the above models.
- **Seed Data**: Include demo seeds for a test agent with sample 402 responses and Devnet transactions.
- **Middleware**: Prisma middleware for audit logging: Automatically create AuditEvent on Payment status changes.
- **Environment-Specific**: Use connection strings with `?sslmode=require` for AWS RDS PostgreSQL.

## User Stories for Database
- As an API developer, I want to query the audit trail for successful x402 payments so I can verify monetization flows.
- As an autonomous agent, I need balance checks before payments to trigger low-balance pauses and top-up events.
- As a hackathon participant, I want retry logs to debug network issues in Devnet simulations.
- As a researcher, I want to filter ApiRequest dataAccessed for AI insights post-payment to analyze machine-to-machine value exchange.

## Specifications
- **Data Retention**: 90 days for audit logs; configurable via Prisma extensions.
- **Backup**: Daily snapshots to S3 via pg_dump, integrated with Vercel/Render deployments.
- **Testing**: Unit tests in Jest for schema validation (e.g., ensure x402_instructions JSONB parses correctly); integration tests with Postman for end-to-end flows querying the DB.
- **Extensibility**: Reserve fields like `mainnet_flag` in Payments for future Solana Mainnet migration; add Rust-program interactions via a new SolanaProgram table if needed.
- **Compliance**: Aligns with project security (e.g., no raw private keys stored; only hashes). Supports GDPR-like deletion for agent sessions.

This schema ensures the Autopay Agent's database is robust, observable, and tailored to x402 autonomous payments, complementing backend APIs for FrontendDev (e.g., balance queries) and BackendDev (e.g., transaction insertions). For full Prisma schema.prisma, refer to the backend repository.