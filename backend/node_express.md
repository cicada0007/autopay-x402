# Express.js API Structure for Autopay Agent Backend

This document outlines the Express.js API structure for the backend of the Autopay Agent project, built with TypeScript and Node.js. The backend serves as the core server for the semi-autonomous to fully autonomous agent, handling logic for detecting HTTP 402 Payment Required responses, processing Phantom CASH payments on Solana Devnet, retrying API calls to premium data sources, and maintaining an audit trail. It integrates with the Coinbase x402 reference SDK for payment instructions parsing and Solana/web3.js for blockchain interactions.

The Express.js server exposes APIs for:
- Triggering agent workflows (e.g., data requests to simulated premium APIs).
- Managing payment executions and retries.
- Monitoring agent state, balances, and logs.
- Secure integration points for Phantom Wallet session delegation.

This structure ensures non-blocking resilience with features like exponential backoff retries, circuit-breaker logic for RPC failures, and real-time balance checks. All sensitive operations use AES-256 encryption for keys and tokens, with Devnet isolation.

**Key Design Principles:**
- **Modularity:** Routes are organized by feature (e.g., `/agent`, `/payments`, `/logs`).
- **Security:** Middleware for authentication (JWT for session tokens), rate limiting, and CORS configuration tailored to the Next.js frontend.
- **Error Handling:** Centralized error middleware with classification for payment failures, network issues, and insufficient funds.
- **Observability:** Integration with a local JSON ledger for transaction audits; optional PostgreSQL via Prisma for persistent storage of agent states.
- **Scalability:** Async/await patterns for Solana RPC calls; queueing with BullMQ for retry jobs.

The backend deploys to Render or Cloudflare Workers, with Docker support for local development. It complements the Next.js frontend by providing RESTful endpoints for real-time status updates (e.g., via WebSockets for payment callbacks).

## Project Structure

The backend codebase follows a clean architecture with Express.js as the web framework. Key directories:

```
backend/
├── src/
│   ├── controllers/     # Request handlers (e.g., agentController.ts)
│   ├── middleware/      # Custom middleware (e.g., auth.ts, rateLimit.ts)
│   ├── models/          # Prisma models and JSON ledger interfaces (e.g., TransactionLog.ts)
│   ├── routes/          # Express route definitions (e.g., agentRoutes.ts)
│   ├── services/        # Business logic (e.g., paymentService.ts, solanaService.ts)
│   ├── utils/           # Helpers (e.g., encryption.ts, retryLogic.ts)
│   └── types/           # TypeScript interfaces (e.g., x402Response.ts)
├── prisma/              # Prisma schema for PostgreSQL
│   └── schema.prisma
├── package.json
├── tsconfig.json
├── .env.example         # Environment variables (e.g., SOLANA_RPC_URL, PHANTOM_SESSION_SECRET)
└── docker-compose.yml   # For local dev with PostgreSQL
```

## Dependencies

Install core dependencies via npm:

```bash
npm install express cors helmet morgan body-parser jsonwebtoken @solana/web3.js @coinbase/x402-sdk prisma @prisma/client bullmq crypto-js
npm install -D @types/express @types/node ts-node nodemon typescript jest supertest
```

- **express**: Core web framework.
- **@solana/web3.js**: Solana blockchain interactions (e.g., transaction signing via Phantom session keys).
- **@coinbase/x402-sdk**: Parsing 402 responses and facilitator verification.
- **prisma**: ORM for PostgreSQL (e.g., storing agent sessions and audit logs).
- **bullmq**: Redis-based queue for retry jobs (e.g., payment retries with exponential backoff).
- **crypto-js**: AES-256 encryption for ephemeral key storage.
- **jsonwebtoken**: For scoped session tokens from Phantom delegation.
- **jest & supertest**: Unit/integration testing for API endpoints.

Environment variables (`.env`):
```
PORT=3001
SOLANA_RPC_URL=https://api.devnet.solana.com
PHANTOM_SESSION_SECRET=your_aes_256_key_here
COINBASE_FACILITATOR_API_KEY=your_key
DATABASE_URL=postgresql://user:pass@localhost:5432/autopay_db
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
RETRY_MAX=3
BALANCE_THRESHOLD=0.1  # USDC Devnet threshold
```

## Server Setup

The main entry point is `src/app.ts`, which initializes Express, middleware, routes, and Prisma client.

```typescript
// src/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import agentRoutes from './routes/agentRoutes';
import paymentRoutes from './routes/paymentRoutes';
import logRoutes from './routes/logRoutes';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { encrypt } from './utils/encryption';

const app: Application = express();
const prisma = new PrismaClient();

// Global middleware
app.use(helmet()); // Security headers
app.use(cors({ origin: 'http://localhost:3000', credentials: true })); // Allow Next.js frontend
app.use(morgan('combined')); // Logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 payments per window
  message: 'Too many payment attempts, please try again later.'
});
app.use('/api/payments', paymentLimiter);

// Authentication middleware for protected routes
app.use('/api/agent', authMiddleware);

// Routes
app.use('/api/agent', agentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/logs', logRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Graceful shutdown (for Docker)
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Autopay Agent Backend running on port ${PORT}`);
});

export default app;
```

Run the server:
```bash
npm run dev  # Uses nodemon for development
npm start    # Production
```

## Database Schema (Prisma)

While the audit trail uses a local JSON ledger (`data/audit.json`) for simplicity, PostgreSQL via Prisma stores persistent agent states (e.g., sessions, failed transactions). Run `npx prisma generate` and `npx prisma db push` after setup.

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model AgentSession {
  id        String   @id @default(cuid())
  sessionToken String @unique
  scope     String   // e.g., "payment:3:1h"
  expiresAt DateTime
  walletAddress String
  createdAt DateTime @default(now())
  transactions Transaction[]
}

model Transaction {
  id             String   @id @default(cuid())
  hash           String   @unique
  type           String   // "payment", "retry", "failure"
  status         String   // "pending", "confirmed", "failed"
  amount         Float
  currency       String   @default("USDC")
  apiEndpoint    String   // e.g., "/api/market-feed"
  sessionId      String
  session        AgentSession @relation(fields: [sessionId], references: [id])
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  errorDetails   String?
}

model AuditLog {
  id         String   @id @default(cuid())
  event      String   // "low_balance", "network_failure", "payment_success"
  details    Json
  timestamp  DateTime @default(now())
}
```

This schema supports querying failed payments for retry logic and balance events.

## API Routes

### 1. Agent Routes (`/api/agent`)
Handles workflow triggers for demo/interactive modes. Requires JWT auth from Phantom session delegation.

- **POST /api/agent/trigger-request**  
  Initiates a data request to a premium API (e.g., Market Data or Knowledge Data). Simulates a 402 response detection and queues payment if needed.  
  Body: `{ "endpoint": "/market-feed", "apiType": "market" | "knowledge" }`  
  Response: `{ "requestId": string, "status": "queued" | "402_detected" }`  
  Logic: Uses `agentService.ts` to fetch via Axios, parse x402 headers with Coinbase SDK, and trigger paymentService if 402.

  ```typescript
  // src/controllers/agentController.ts (excerpt)
  import { Request, Response } from 'express';
  import { triggerRequest } from '../services/agentService';

  export const triggerRequestHandler = async (req: Request, res: Response) => {
    const { endpoint, apiType } = req.body;
    const sessionId = req.user?.sessionId; // From JWT

    try {
      const result = await triggerRequest(endpoint, apiType, sessionId);
      if (result.is402) {
        // Queue payment retry
        await paymentService.processPayment(result.paymentInstructions, sessionId);
      }
      res.json({ requestId: result.id, status: result.status, data: result.data || null });
    } catch (error) {
      res.status(500).json({ error: 'Request failed', details: error.message });
    }
  };
  ```

- **GET /api/agent/status/:requestId**  
  Retrieves real-time status (e.g., payment pending, retrying, accessed).  
  Response: `{ "status": "completed", "data": { prices: [...] }, "txHash": string }`

- **POST /api/agent/configure-autonomy**  
  Sets autonomy level (Phase 1-3). Body: `{ "level": 1 | 2 | 3, "apis": ["/market-feed", "/ai-insights"] }`.  
  For Phase 3, starts multi-API monitoring with prioritization (e.g., based on funds via solanaService.getBalance()).

### 2. Payment Routes (`/api/payments`)
Manages Solana transactions with Phantom CASH/USDC. Verifies via Coinbase Facilitator API (REST/WebSocket).

- **POST /api/payments/execute**  
  Executes payment from 402 instructions. Handles up to 3 retries with exponential backoff (100ms, 200ms, 400ms).  
  Body: `{ "instructions": { amount: number, address: string, token: "CASH" }, "sessionToken": string }`  
  Logic: Encrypts session key, signs tx via web3.js, submits to Devnet, monitors confirmation. On failure, logs to JSON ledger and classifies (e.g., insufficient funds → pause event).  
  Response: `{ "txHash": string, "status": "confirmed" | "retrying" | "failed", "balance": number }`

  ```typescript
  // src/services/paymentService.ts (excerpt)
  import { Connection, PublicKey, Transaction } from '@solana/web3.js';
  import { parseX402Instructions } from '@coinbase/x402-sdk';
  import { Queue } from 'bullmq';
  import { encrypt, decrypt } from '../utils/encryption';
  import { verifyFacilitator } from '../utils/facilitator';

  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  const retryQueue = new Queue('paymentRetries', { connection: { host: process.env.REDIS_URL! } });

  export const processPayment = async (instructions: any, sessionToken: string) => {
    const decryptedKey = decrypt(sessionToken); // Ephemeral AES-256
    const { amount, address } = parseX402Instructions(instructions);

    // Check balance
    const balance = await connection.getBalance(new PublicKey(address));
    if (balance < amount * 1e9) { // Lamports
      await logAudit('low_balance', { sessionToken, required: amount });
      throw new Error('Insufficient funds');
    }

    // Circuit breaker for RPC
    if (connection.isRpcFailure) {
      await retryQueue.add('payment', { instructions, sessionToken }, { delay: 5000 });
      return { status: 'queued' };
    }

    const tx = new Transaction().add(/* payment instruction */);
    // Sign with session key (scoped to 3 txs)
    const signature = await connection.sendTransaction(tx, [/* wallet from session */]);
    await verifyFacilitator(signature, instructions); // Coinbase API call

    // Log success to JSON
    appendToLedger({ hash: signature, status: 'confirmed', amount });

    return { txHash: signature, status: 'confirmed' };
  };
  ```

- **GET /api/payments/balance**  
  Returns current Devnet balance for the session wallet. Triggers low-balance event if below threshold.

- **POST /api/payments/retry/:txHash**  
  Manual retry for failed tx (up to max). Uses BullMQ job for backoff.

### 3. Log Routes (`/api/logs`)
Exposes audit trail for frontend visualization.

- **GET /api/logs/transactions**  
  Fetches from JSON ledger or Prisma. Query params: `?status=failed&limit=10`.  
  Response: Array of `{ hash, status, timestamp, details }`.

- **GET /api/logs/events**  
  Recent events (e.g., network issues, retries). Supports filtering by session.

## Middleware Highlights

- **auth.ts**: Validates JWT from Phantom delegation. Extracts session scope (e.g., time-limited to 1h, 3 payments).  
  ```typescript
  // Excerpt
  export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const decoded = jwt.verify(token, process.env.PHANTOM_SESSION_SECRET!) as any;
      if (new Date() > new Date(decoded.expiresAt)) {
        return res.status(401).json({ error: 'Session expired' });
      }
      req.user = { sessionId: decoded.sessionId, scope: decoded.scope };
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
  ```

- **errorHandler.ts**: Classifies errors (e.g., `PaymentFailureError`, `NetworkError`). Logs to Prisma AuditLog.

- **retryLogic.ts**: Generic exponential backoff utility, used in services for up to 3 attempts.

## Testing

Use Jest for unit tests (e.g., paymentService) and Supertest for API integration.

```typescript
// tests/paymentRoutes.test.ts (excerpt)
import request from 'supertest';
import app from '../src/app';

describe('Payment Routes', () => {
  it('should execute payment and return txHash', async () => {
    const response = await request(app)
      .post('/api/payments/execute')
      .set('Authorization', 'Bearer valid_token')
      .send({ instructions: mockInstructions });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('txHash');
  });

  it('should handle insufficient funds', async () => {
    // Mock low balance
    const response = await request(app).post('/api/payments/execute').send(mockLowBalance);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Insufficient funds');
  });
});
```

Run tests: `npm test`. Postman collections for end-to-end flows (e.g., trigger → 402 → pay → retry → access data).

## Deployment Notes

- **Dockerfile**: Builds Node.js image with Prisma migrations.  
- **Render/Cloudflare**: Set env vars; use PM2 for process management.  
- **Integration with Frontend**: WebSocket endpoint (`/ws/logs`) for real-time updates (e.g., tx confirmations) via Socket.io.  
- **Future Extensibility**: Add Rust Solana programs for custom payment facilitators via `@solana/spl-token`.

This Express.js structure provides a robust, secure foundation for the Autopay Agent's backend, enabling seamless coordination with the Next.js frontend for visualization and the Solana Devnet for payments. For updates, reference the unique identifier: 1762841338037_autopay_agent_for_x402_autonomous_payments_on_solana__backend_node_express_md_vcidr.