# API Endpoint Tests for Autopay Agent

## Overview

This document outlines comprehensive testing strategies for the backend API endpoints of the Autopay Agent project. The Autopay Agent facilitates autonomous x402 payment flows on Solana Devnet, integrating with premium APIs such as the Market Data API (for real-time crypto prices, arbitrage signals, and sentiment metrics) and the Knowledge Data API (for AI research insights). All tests are designed to validate the end-to-end functionality, including 402 Payment Required detection, Phantom CASH/USDC payment execution via Solana/web3.js, post-payment retries, resilience mechanisms (retries, balance monitoring, circuit-breaker), and secure integration with the Coinbase x402 Facilitator API.

Tests are implemented using **Jest** for unit and integration testing in TypeScript/Node.js, and **Postman** for manual/automated API flow simulations. The testing environment uses Solana Devnet for blockchain interactions, mocked RPC endpoints for reliability, and a local JSON ledger for audit trail verification. Environment variables (e.g., `SOLANA_RPC_URL`, `PHANTOM_SESSION_KEY`, `COINBASE_FACILITATOR_API_KEY`) are loaded via `dotenv` for isolation.

Key testing principles:
- **Idempotency**: Payments and retries must not duplicate transactions (verified via transaction hashes in the JSON ledger).
- **Security**: Scoped Phantom permissions and AES-256 encryption are tested for session key handling.
- **Resilience**: Exponential backoff (e.g., 1s, 2s, 4s delays), balance thresholds (< 0.01 USDC pauses operations), and circuit-breaker (RPC failure queues payments).
- **Coverage**: Aim for >90% coverage on critical paths using `nyc` for reporting.
- **Mocking**: Use `nock` for HTTP mocks (e.g., 402 responses, Facilitator API callbacks) and `@solana/web3.js` mocks for blockchain simulations to avoid real Devnet spends during CI/CD.

Run tests with:
```bash
npm test -- --coverage
# Or for Postman collection
newman run autopay-agent-api.collection.json -e devnet.env
```

## Test Environment Setup

1. **Dependencies**: Install via `package.json`:
   ```
   "devDependencies": {
     "jest": "^29.7.0",
     "jest-environment-node": "^29.7.0",
     "nock": "^13.3.5",
     "@types/nock": "^13.0.1",
     "supertest": "^6.3.4",
     "dotenv": "^16.3.1"
   }
   ```

2. **Mock Data**:
   - Solana Devnet wallet: Pre-fund a test wallet with 1 USDC via faucet (e.g., `walletAddress: "11111111111111111111111111111112"` for system program mocks).
   - 402 Response Payload: Simulate with headers `{ "x402-payment-required": "solana:pay?recipient=FacilitatorPubkey&amount=0.001&currency=USDC" }`.
   - JSON Ledger: Initialize `./ledger/transactions.json` with empty array `[]`.

3. **Database/Storage**: No persistent DB; use in-memory for ledger. For Prisma (if extended), seed with test schemas:
   ```prisma
   model Transaction {
     id        String   @id @default(cuid())
     hash      String   @unique
     status    String   // "pending", "success", "failed"
     timestamp DateTime @default(now())
     metadata  Json?
   }
   ```

4. **CI/CD Integration**: GitHub Actions workflow in `.github/workflows/api-tests.yml` runs Jest on push/PR, with Devnet-only e2e tests.

## Unit Test Suites

### 1. 402 Detection and Parsing
Test the core detection logic in `/src/agents/detector.ts`.

- **Test Case: Parse Valid x402 Header**
  ```typescript
  import { detect402 } from '../src/agents/detector';
  import nock from 'nock';

  describe('402 Detection', () => {
    it('should parse x402 payment instructions from headers', async () => {
      nock('http://localhost:3000')
        .get('/api/market-feed')
        .reply(402, { error: 'Payment Required' }, {
          'x402-payment-required': 'solana:pay?recipient=9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM&amount=0.001&currency=USDC&memo=MarketDataAccess'
        });

      const response = await fetch('http://localhost:3000/api/market-feed');
      const instructions = detect402(response);
      expect(instructions).toEqual({
        recipient: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        amount: 0.001,
        currency: 'USDC',
        memo: 'MarketDataAccess'
      });
    });

    it('should throw error on invalid x402 header', async () => {
      nock('http://localhost:3000')
        .get('/api/knowledge-insights')
        .reply(402, {}, { 'x402-payment-required': 'invalid-uri' });

      const response = await fetch('http://localhost:3000/api/knowledge-insights');
      expect(() => detect402(response)).toThrow('Invalid x402 URI');
    });
  });
  ```

- **Edge Cases**: Empty headers, malformed URI, non-402 status (e.g., 403 Forbidden).

### 2. Payment Execution with Phantom Integration
Test `/src/payments/executor.ts` for Solana transactions using web3.js and Coinbase Facilitator.

- **Test Case: Successful USDC Payment on Devnet**
  ```typescript
  import { executePayment } from '../src/payments/executor';
  import { Connection, Keypair } from '@solana/web3.js';
  jest.mock('@solana/web3.js', () => ({
    Connection: jest.fn(),
    Keypair: jest.fn(() => ({ publicKey: { toString: () => 'testPubkey' } }))
  }));

  describe('Payment Execution', () => {
    beforeEach(() => {
      process.env.PHANTOM_SESSION_KEY = 'mock-session-encrypted-with-aes256';
    });

    it('should execute and verify payment via Facilitator API', async () => {
      nock('https://facilitator.coinbase.com')
        .post('/verify')
        .reply(200, { status: 'verified', hash: 'mockTxHash' });

      const result = await executePayment({
        recipient: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        amount: 0.001,
        currency: 'USDC',
        memo: 'TestPayment'
      });

      expect(result.hash).toBe('mockTxHash');
      expect(result.status).toBe('success');
      // Verify ledger append
      const ledger = require('../ledger/transactions.json');
      expect(ledger[0].hash).toBe('mockTxHash');
    });

    it('should encrypt and isolate session key', () => {
      const key = getEncryptedSessionKey('mock-key');
      expect(key).toMatch(/^AES256:/); // Prefix for verification
    });
  });
  ```

- **Edge Cases**: Invalid recipient, low balance (<0.01 USDC triggers "Low Balance" event), network timeout (mocks RPC failure).

### 3. Retry Mechanism
Test `/src/retry/retryHandler.ts` with exponential backoff.

- **Test Case: Retry After Successful Payment**
  ```typescript
  import { retryAfterPayment } from '../src/retry/retryHandler';

  describe('Retry Logic', () => {
    it('should retry API call up to 3 times post-payment', async () => {
      let callCount = 0;
      const mockAPI = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('402 Pending');
        }
        return { data: 'Premium Market Feed: BTC $60k' };
      });

      const result = await retryAfterPayment(mockAPI, { endpoint: '/api/market-feed' });
      expect(callCount).toBe(2); // Initial + 1 retry
      expect(result).toEqual({ data: 'Premium Market Feed: BTC $60k' });
    });

    it('should apply exponential backoff on failure', async () => {
      const clock = jest.useFakeTimers();
      const mockDelayed = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate backoff
        throw new Error('RPC Failure');
      });

      await retryAfterPayment(mockDelayed, { maxRetries: 3 });
      expect(setTimeout).toHaveBeenCalledTimes(3); // Delays: 1s, 2s, 4s
      clock.restore();
    });
  });
  ```

- **Edge Cases**: Max retries exceeded (logs to ledger as "failed"), circuit-breaker activation (queues on RPC error).

## Integration Test Suites

### 1. End-to-End Flow: Market Data API
Simulate full flow using Supertest against Express server.

- **Test Case: Autonomous Access to Premium Endpoint**
  ```typescript
  import request from 'supertest';
  import app from '../src/app'; // Express app

  describe('E2E: Market Data Flow', () => {
    it('should detect 402, pay, and access data autonomously', async () => {
      // Mock 402 on first call, 200 after
      nock('http://localhost:3001') // Simulated premium API
        .get('/api/market-feed')
        .times(1)
        .reply(402, {}, { 'x402-payment-required': 'solana:pay?...' })
        .get('/api/market-feed')
        .reply(200, { prices: { BTC: 60000 }, signals: 'Arbitrage Opportunity' });

      nock('https://facilitator.coinbase.com').post('/verify').reply(200, { verified: true });

      const response = await request(app)
        .post('/api/agent/request-data')
        .send({ endpoint: 'http://localhost:3001/api/market-feed', autonomy: 'full' })
        .expect(200);

      expect(response.body).toHaveProperty('data.prices.BTC', 60000);
      expect(response.body).toHaveProperty('payment.hash', expect.any(String));
    });
  });
  ```

### 2. End-to-End Flow: Knowledge Data API
Similar to above, but for AI insights endpoint.

- **Test Case**: Focus on memo field for "AIResearchAccess" and WebSocket callback for verification.

### 3. Resilience Integration
- **Low Balance Event**: Mock wallet balance query returns 0.0005 USDC; expect pause and event emit.
- **Circuit-Breaker**: Simulate 5 consecutive RPC failures; verify queueing and resume after mock restore.
- **Audit Trail**: After tests, assert JSON ledger contains entries with timestamps, statuses, and metadata (e.g., `{ "type": "payment", "amount": 0.001 }`).

## Postman Collection

Exportable collection: `autopay-agent-api.collection.json`

- **Folder: Core Endpoints**
  - `POST /api/agent/init-session`: Test Phantom session delegation (body: `{ "scope": "sign:3tx", "duration": "1h" }`).
  - `POST /api/agent/request-data`: Payload with endpoint URL; variables for Devnet RPC.
  - `GET /api/agent/status`: Verify balance and queued payments.

- **Folder: Error Simulations**
  - 402 Trigger: Set header in pre-request script.
  - Payment Failure: Mock Facilitator reject (401).

- **Environment Variables**: `{{solana_rpc}}`, `{{phantom_wallet}}`, `{{facilitator_key}}`.

## Performance and Load Testing

- Use Artillery for load: Simulate 10 concurrent agents requesting `/api/market-feed`.
  ```yaml
  config:
    target: 'http://localhost:3000'
    phases:
      - duration: 60
        arrivalRate: 5
  scenarios:
    - flow:
        - post:
            url: "/api/agent/request-data"
            json: { "endpoint": "/api/market-feed" }
  ```
- Metrics: Response time <500ms for retries, no duplicates in ledger under load.

## Best Practices and Maintenance

- **Test Data Cleanup**: Post-test hook clears ledger and mocks.
- **Security Scans**: Integrate `jest-security` for key exposure checks.
- **Versioning**: Tag tests with project version (e.g., v1.0.0 for initial Devnet demo).
- **Extensibility**: Future tests for Phase 3 multi-API monitoring (prioritize by `dataFreshness` score).

This suite ensures the backend APIs are robust for the x402 autonomous payment economy, aligning with demo, interactive, and full autonomy phases. Update tests with any schema changes from Prisma migrations.