# Unit Tests Structure for Autopay Agent

## Overview

This document outlines the unit testing strategy and structure for the Autopay Agent project, a fully autonomous system for handling HTTP 402 Payment Required responses in premium APIs using Phantom CASH payments on Solana Devnet. Unit tests focus on isolating individual components of the agent's logic, ensuring reliability in core functionalities such as 402 response detection, payment execution, API retries, wallet integration, and resilience mechanisms. These tests are designed to validate the agent's behavior in a controlled environment, simulating real-world interactions with Market Data API (e.g., crypto prices and arbitrage signals) and Knowledge Data API (e.g., AI research insights) endpoints.

The testing approach aligns with the project's technical requirements: Backend logic in TypeScript with Node.js, leveraging Jest for unit tests, Solana/web3.js for blockchain simulations, and the Coinbase x402 reference SDK for payment flows. Tests emphasize edge cases like payment failures, insufficient funds, and network disruptions, while adhering to security best practices such as scoped Phantom permissions and ephemeral key handling.

Unit tests are organized under the `testing/unit` directory, with separate suites for backend modules, agent utilities, and mock integrations. They do not cover integration or end-to-end flows (handled in `integration_tests.md` or similar), nor database schema validations (see `db/schema.md`). The goal is 85%+ code coverage for critical paths, measured via Jest's `--coverage` flag.

## Testing Framework and Setup

- **Framework**: Jest (v29+), integrated with TypeScript via `ts-jest`. Supports async testing for blockchain mocks and HTTP simulations.
- **Mocking Libraries**:
  - `@solana/web3.js` and `@solana/spl-token` mocked using `jest.mock` for Devnet transactions without real RPC calls.
  - Axios or Node.js `http` module mocked for API requests to simulated Next.js endpoints (e.g., `/api/market-feed`).
  - Coinbase x402 Facilitator API mocked with `nock` for REST/WebSocket responses, ensuring verifiable payment hashes.
  - Phantom Wallet SDK mocked via `vi.mock` (from Vitest compatibility if needed) to simulate session keys and signing without browser context.
- **Dependencies**: Install via `npm i -D jest ts-jest @types/jest nock sinon`. Configure in `jest.config.js`:
  ```javascript
  module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/testing/setup.ts'],
    coverageThreshold: {
      global: { branches: 85, functions: 85, lines: 85, statements: 85 },
    },
    moduleNameMapping: {
      '^@/(.*)$': '<rootDir>/src/$1',
    },
  };
  ```
- **Setup File** (`testing/setup.ts`): Global mocks for Solana connection (e.g., `new Connection('https://api.devnet.solana.com')` replaced with in-memory ledger) and logging (suppress console output in tests).
- **Running Tests**:
  - All: `npm run test:unit`
  - Specific file: `npm run test:unit -- src/agent/paymentHandler.test.ts`
  - Coverage: `npm run test:unit -- --coverage`
  - Watch mode: `npm run test:unit -- --watch`

## Test Coverage Areas

Unit tests are modular, targeting the agent's key features from the project requirements. Each test suite uses AAA (Arrange-Act-Assert) patterns, with descriptive names like `shouldDetect402ResponseAndParseInstructions`. Mock data includes simulated 402 headers (e.g., `x402-payment: {"amount": 0.01, "currency": "CASH", "facilitator": "coinbase"}`) and Devnet token accounts.

### 1. Agent Core Logic
Tests for the main agent orchestration in `src/agent/autopayAgent.ts`, focusing on request detection and flow initiation.

- **Detection of 402 Responses**:
  - Parse HTTP 402 status and `x402-payment` headers from API responses.
  - Validate instruction extraction (e.g., amount, currency, facilitator URL).
  - Edge cases: Invalid JSON in headers, missing headers on 402, non-402 premiums (e.g., 403 Forbidden).
  - Example: `detectPaymentRequired.test.ts`
    ```typescript
    import { detectPaymentRequired } from '../src/agent/detection';
    import { Response } from 'express'; // Mock HTTP response

    describe('402 Response Detection', () => {
      it('should parse valid x402 instructions from headers', async () => {
        const mockRes = new Response();
        mockRes.status = 402;
        mockRes.set('x402-payment', JSON.stringify({
          amount: 0.01,
          currency: 'CASH',
          facilitator: 'https://facilitator.coinbase.com/pay',
          target: '/api/market-feed'
        }));

        const result = detectPaymentRequired(mockRes);
        expect(result.required).toBe(true);
        expect(result.instructions.amount).toBe(0.01);
        expect(result.instructions.currency).toBe('CASH');
      });

      it('should handle malformed x402 JSON gracefully', async () => {
        const mockRes = new Response();
        mockRes.status = 402;
        mockRes.set('x402-payment', 'invalid-json');

        const result = detectPaymentRequired(mockRes);
        expect(result.required).toBe(true);
        expect(result.error).toBeDefined();
        expect(result.instructions).toBeNull();
      });
    });
    ```

- **API Retry Mechanism**:
  - Post-payment retry logic with exponential backoff (e.g., 100ms, 200ms, 400ms delays).
  - Success path: Retry succeeds after mock payment confirmation.
  - Failure: Exceed 3 retries and log to JSON ledger.

### 2. Payment Handling
Tests for `src/payment/solanaPayment.ts`, simulating Phantom CASH or USDC transactions on Devnet.

- **Transaction Execution**:
  - Build and sign transactions using mocked Phantom session keys.
  - Verify transfer amounts (e.g., 0.01 CASH to facilitator address).
  - Integration with Coinbase Facilitator: Mock API call to submit payment hash and receive verification callback.
- **Balance Monitoring**:
  - Mock wallet balance query via `getTokenAccountBalance`.
  - Trigger "Low Balance" event if below threshold (e.g., 0.05 USDC).
  - Example: `balanceMonitor.test.ts`
    ```typescript
    import { monitorBalance, BalanceEvent } from '../src/payment/balanceMonitor';
    import { Connection, PublicKey } from '@solana/web3.js';

    jest.mock('@solana/web3.js');

    describe('Balance Monitoring', () => {
      const mockConnection = new Connection('mock-rpc');
      const walletPubkey = new PublicKey('11111111111111111111111111111112'); // Mock token account

      it('should emit low balance event when below threshold', async () => {
        const mockBalance = { value: { uiAmount: 0.02 } }; // Below 0.05 threshold
        (mockConnection.getTokenAccountBalance as jest.Mock).mockResolvedValue(mockBalance);

        const events: BalanceEvent[] = [];
        monitorBalance(mockConnection, walletPubkey, 0.05, (event) => events.push(event));

        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async monitor

        expect(events[0]).toEqual({ type: 'low-balance', current: 0.02, threshold: 0.05, action: 'pause-transactions' });
      });

      it('should continue normally if balance sufficient', async () => {
        const mockBalance = { value: { uiAmount: 0.10 } };
        (mockConnection.getTokenAccountBalance as jest.Mock).mockResolvedValue(mockBalance);

        const events: BalanceEvent[] = [];
        monitorBalance(mockConnection, walletPubkey, 0.05, (event) => events.push(event));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(events.length).toBe(0);
      });
    });
    ```

### 3. Wallet and Blockchain Integration
Tests for `src/wallet/phantomIntegration.ts`, ensuring secure, scoped access.

- **Session Key Management**:
  - Generate time-limited session tokens (e.g., 1-hour expiry, 3-tx limit).
  - Simulate signing with AES-256 encryption mocks.
  - Verify Devnet isolation: No mainnet references in mocks.
- **Facilitator Verification**:
  - Mock WebSocket callbacks for payment confirmation.
  - Handle spoofed transaction rejection.

### 4. Resilience and Error Handling
Tests for `src/resilience/retryHandler.ts` and `src/audit/ledger.ts`.

- **Payment Retries**:
  - Simulate failures (e.g., RPC timeout, transaction rejection).
  - Apply exponential backoff and cap at 3 attempts.
  - Log failed hashes to JSON ledger without duplication.
- **Circuit Breaker**:
  - Queue payments on network failure; resume on mock RPC restore.
- **Audit Trail**:
  - Append successful/failed entries to `ledger.json` (in-memory mock for tests).
  - Example entry: `{ timestamp: Date.now(), type: 'payment-success', hash: 'mockHash', amount: 0.01, api: '/api/market-feed' }`.

### 5. Security Features
Isolated tests for `src/security/keyManager.ts`.

- **Encryption and Isolation**:
  - Mock AES-256 encryption/decryption of session tokens.
  - Ensure ephemeral storage: Tokens cleared post-use.
  - Reject unauthorized scopes (e.g., full wallet access requests).

## Example Test File Organization

The `testing/unit` directory mirrors the `src` structure for easy mapping:

```
testing/unit/
├── agent/
│   ├── autopayAgent.test.ts      # Core flow orchestration
│   └── detection.test.ts         # 402 parsing
├── payment/
│   ├── solanaPayment.test.ts     # Tx building/signing
│   └── balanceMonitor.test.ts    # Fund checks
├── wallet/
│   └── phantomIntegration.test.ts # Session handling
├── resilience/
│   └── retryHandler.test.ts      # Backoff and queuing
└── audit/
    └── ledger.test.ts            # JSON logging
```

Each file includes 10-20 tests, with setup/teardown for mocks.

## Best Practices and Guidelines

- **Mocking Philosophy**: Use deterministic mocks for blockchain (e.g., fixed blockhashes) to avoid flakiness. Never use real Devnet RPC in unit tests.
- **Async Handling**: All blockchain/payment tests are `async` with `await` for promises.
- **Error Classification**: Tests assert specific error types (e.g., `PaymentFailureError` vs. `NetworkError`).
- **Coverage Reporting**: Integrate with CI (e.g., GitHub Actions) to fail builds below 85% coverage. Use `jest-html-reporter` for visual reports.
- **Extensibility**: Tests are written to accommodate future Rust Solana programs (e.g., mock program invocations).
- **Unique Identifiers**: Each test suite includes a project-specific tag for traceability, e.g., `// autopay-agent-unit-1762841361806` in comments.

This structure ensures the Autopay Agent's unit tests are robust, maintainable, and directly support the project's autonomy levels—from demo mode Node.js processes to full multi-API monitoring—while preventing regressions in x402 economy flows. For integration tests involving real API simulations, refer to related testing docs.