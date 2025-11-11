# Authentication Implementation

## Overview

In the Autopay Agent for x402 Autonomous Payments on Solana, authentication is a critical layer that ensures secure interactions between the backend services, the Phantom Wallet integration, premium API endpoints (e.g., Market Data API and Knowledge Data API), and the Coinbase x402 Facilitator API. Given the project's focus on autonomous machine-to-machine transactions, authentication emphasizes scoped, ephemeral, and blockchain-native mechanisms rather than traditional username/password flows. This approach aligns with the decentralized nature of Solana Devnet transactions using Phantom CASH or USDC, while maintaining compliance with x402 protocol standards.

The authentication system supports three autonomy phases:
- **Phase 1 (Demo Mode)**: Server-hosted Node.js processes use isolated Devnet wallets with programmatic signing.
- **Phase 2 (Interactive Mode)**: Browser-based interactions via Next.js frontend require user-approved Phantom connections.
- **Phase 3 (Full Autonomy)**: Multi-API monitoring leverages session delegations for hands-off operation.

All authentication artifacts (e.g., session tokens, private keys) are handled ephemerally, encrypted with AES-256, and never persisted to disk. This documentation details the implementation using TypeScript/Node.js, Solana/web3.js, the Coinbase x402 SDK, and additional libraries like `jsonwebtoken` for API-level security.

**Key Principles**:
- **Scoped Permissions**: Only transaction-signing access is granted; no full wallet control.
- **Ephemeral Storage**: Keys and tokens exist only in memory during runtime.
- **Verification**: All payments are cross-verified via Coinbase Facilitator API callbacks.
- **Audit Integration**: Authentication events are logged to the JSON ledger for traceability.

## Dependencies

Install the following npm packages for authentication handling:

```bash
npm install @solana/web3.js @coinbase/x402-sdk jsonwebtoken crypto bcryptjs helmet
npm install -D @types/jsonwebtoken @types/bcryptjs
```

- `@solana/web3.js`: For wallet derivation and Solana-specific signing.
- `@coinbase/x402-sdk`: Handles x402 payment instruction parsing and facilitator verification.
- `jsonwebtoken`: For JWT-based API authentication in internal endpoints.
- `crypto`: Node.js built-in for AES-256 encryption.
- `bcryptjs`: For hashing any derived secrets (e.g., session salts).
- `helmet`: Express middleware for securing HTTP headers.

## Wallet Authentication with Phantom Integration

The core of authentication revolves around Phantom Wallet, which serves as the payment executor for 402 responses. The backend does not store wallet private keys; instead, it facilitates secure delegation and signing.

### 1. Connection Establishment

For Phase 2 and 3, the backend exposes an endpoint to initiate Phantom connection. This uses Solana's `PublicKey` derivation and Phantom's injected provider.

**Backend Endpoint Example** (`/api/auth/connect-wallet`):

```typescript
import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { createX402Client } from '@coinbase/x402-sdk';
import crypto from 'crypto';

const app = express();
const connection = new Connection('https://api.devnet.solana.com'); // Devnet only
const x402Client = createX402Client({ network: 'devnet' });

app.post('/api/auth/connect-wallet', async (req, res) => {
  try {
    const { walletAddress } = req.body; // From frontend Phantom provider

    // Validate wallet on Devnet
    const publicKey = new PublicKey(walletAddress);
    const balance = await connection.getBalance(publicKey);
    if (balance < 1000000) { // Minimum lamports threshold for CASH/USDC tx
      return res.status(400).json({ error: 'Insufficient Devnet balance' });
    }

    // Generate ephemeral session token (JWT with 1-hour expiry)
    const sessionPayload = {
      wallet: walletAddress,
      scope: ['signTransaction', 'getBalance'], // Scoped to essentials
      iat: Date.now(),
      exp: Date.now() + 3600000, // 1 hour
    };
    const secret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'); // Ephemeral secret
    const token = jwt.sign(sessionPayload, secret);

    // Encrypt session for ephemeral storage (in-memory cache, e.g., Redis or Map)
    const encryptedToken = crypto.createCipher('aes256', secret).update(token, 'utf8', 'hex');

    // Log to audit trail
    logToLedger({ event: 'wallet_connected', wallet: walletAddress, timestamp: Date.now() });

    res.json({ sessionToken: encryptedToken, status: 'connected' });
  } catch (error) {
    res.status(500).json({ error: 'Connection failed', details: error.message });
  }
});
```

This endpoint is called from the Next.js frontend after user approval in Phantom. The frontend injects the wallet via `window.solana.connect()`.

### 2. Session Delegation for Autonomy

For fully autonomous operation (Phase 3), use Phantom Session Keys to delegate signing without repeated user prompts. Sessions are time-limited (e.g., 3 transactions or 1 hour) and scope-limited to x402 payments.

**Session Key Generation** (Backend Utility):

```typescript
import { Keypair } from '@solana/web3.js';

function generateSessionKey(walletPublicKey: PublicKey, durationMs: number = 3600000): { sessionKeypair: Keypair; nonce: Buffer } {
  const sessionKeypair = Keypair.generate(); // Ephemeral keypair
  const nonce = crypto.randomBytes(32); // Prevent replays

  // Derive session authority: Sign a message with nonce
  const message = `Autopay Agent Session: ${walletPublicKey.toBase58()}:${Date.now() + durationMs}`;
  // In practice, sign with wallet (delegated via Phantom)
  // const signature = await signMessage(nonce, wallet); // From Phantom provider

  // Store in ephemeral memory: { [sessionId]: { keypair: sessionKeypair, expiry: Date.now() + durationMs } }
  const session = { keypair: sessionKeypair, nonce, expiry: Date.now() + durationMs };
  // e.g., sessionsMap.set(walletPublicKey.toBase58(), session);

  return { sessionKeypair, nonce };
}
```

Sessions are verified before each payment:
- Check expiry and nonce against the audit ledger.
- Revoke on low balance or network issues via circuit-breaker.

### 3. Programmatic Wallet for Demo Mode (Phase 1)

In server-hosted demo mode, use a Devnet-isolated keypair for testing. Never use mainnet keys.

```typescript
import { Keypair } from '@solana/web3.js';
import fs from 'fs'; // Only for initial key gen; delete after

// Generate once and encrypt (for demo only)
const demoWallet = Keypair.generate();
const privateKeyBytes = demoWallet.secretKey;
const encryptedKey = crypto.createCipher('aes256', process.env.DEMO_KEY_SECRET).update(
  Buffer.from(privateKeyBytes).toString('hex'), 'hex'
);

// Store encrypted in env or ephemeral var; decrypt only in memory
function getDemoWallet(): Keypair {
  const decrypted = crypto.createDecipher('aes256', process.env.DEMO_KEY_SECRET)
    .update(encryptedKey, 'hex', 'utf8');
  return Keypair.fromSecretKey(Buffer.from(decrypted, 'hex'));
}
```

This wallet is used solely for simulating 402 payment executions in Node.js processes.

## API Endpoint Authentication

Backend APIs (e.g., for retrying premium data requests post-payment) are protected with JWT middleware to prevent unauthorized access from the frontend or external agents.

### Middleware Implementation

```typescript
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access denied: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
    if (err) {
      logToLedger({ event: 'auth_failed', reason: err.message, timestamp: Date.now() });
      return res.status(403).json({ error: 'Invalid token' });
    }
    (req as any).user = user; // Attach wallet/scope to request
    next();
  });
};

// Apply to protected routes
app.use('/api/premium/*', helmet(), authenticateToken);
```

**Protected Endpoint Example** (Retry after 402 Payment):

```typescript
app.get('/api/premium/market-feed', authenticateToken, async (req: Request, res: Response) => {
  const { wallet } = (req as any).user;
  try {
    // Verify payment status via Coinbase Facilitator
    const paymentVerified = await x402Client.verifyPayment({
      wallet,
      txHash: req.query.txHash as string, // From previous payment
      apiEndpoint: '/api/market-feed',
    });

    if (!paymentVerified) {
      return res.status(402).json({ error: 'Payment not verified' });
    }

    // Fetch premium data (simulated)
    const data = await fetchMarketData(); // Integrate with Next.js API route or direct Solana query
    res.json({ data, accessedAt: Date.now() });
  } catch (error) {
    res.status(500).json({ error: 'Retry failed' });
  }
});
```

## Security Best Practices

- **Encryption Everywhere**: Use AES-256 for all sensitive data. Example utility:
  ```typescript
  function encryptData(data: string, key: string): string {
    const cipher = crypto.createCipher('aes256', key);
    return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
  }
  ```
- **Devnet Isolation**: Hardcode Solana Devnet RPC; block mainnet connections via env checks.
- **Rate Limiting**: Implement with `express-rate-limit` to prevent auth brute-force (e.g., 5 attempts per wallet/IP per minute).
- **HTTPS Enforcement**: Use `helmet` and force HTTPS in production (Vercel/Render).
- **Secret Management**: Load `JWT_SECRET` and `DEMO_KEY_SECRET` from environment variables; rotate weekly.
- **Facilitator Verification**: Every auth-scoped payment calls Coinbase's API:
  ```typescript
  await x402Client.verify({
    txSignature: txHash,
    facilitatorId: process.env.COINBASE_FACILITATOR_ID,
  });
  ```
- **Error Handling**: Classify auth errors in the retry system (e.g., 'auth_expired' triggers session refresh).
- **Compliance**: Adhere to x402 specs for payment instructions; log all auth events to prevent replay attacks.

## Testing Authentication

### Unit Tests (Jest)

```typescript
import { generateSessionKey } from './auth.utils';

describe('Session Key Generation', () => {
  it('should generate valid ephemeral keypair with expiry', () => {
    const mockPublicKey = new PublicKey('11111111111111111111111111111111');
    const { sessionKeypair, nonce } = generateSessionKey(mockPublicKey);
    expect(sessionKeypair.publicKey).toBeInstanceOf(PublicKey);
    expect(nonce.length).toBe(32);
  });
});
```

### Integration Tests (Postman/Jest Supertest)

Simulate full flow:
1. POST `/api/auth/connect-wallet` → Get token.
2. Use token to GET `/api/premium/market-feed` → Expect 200 if "paid".
3. Test failure: Invalid token → 403.

Run: `npm test -- --coverage auth`.

## Deployment Considerations

- **Environment Variables**: Set `JWT_SECRET`, `DEMO_KEY_SECRET`, `COINBASE_FACILITATOR_ID` in Render/Cloudflare Workers.
- **Ephemeral Storage**: Use in-memory Maps for sessions; for scaling, integrate Redis with TTL.
- **Monitoring**: Integrate with audit ledger for auth metrics (e.g., success rate > 95%).
- **Extensibility**: For Phase 3, add multi-wallet support via a wallet pool, authenticated per API priority.

This authentication implementation ensures the Autopay Agent operates securely in a decentralized x402 economy, balancing autonomy with robust safeguards. For frontend coordination, expose session tokens via API contracts documented in `api-contracts.md`. Refer to `security.md` for advanced threat modeling.

**Unique Identifier**: 1762841338087_autopay_agent_for_x402_autonomous_payments_on_solana__backend_auth_md_uwew5q  
**Last Updated**: October 2023 (Hackathon Demo Version)