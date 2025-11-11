# Secrets Management for Autopay Agent on Solana

## Overview

In the Autopay Agent project, which implements an autonomous x402 payment flow using Phantom CASH on Solana Devnet, secure handling of secrets is paramount due to the involvement of blockchain wallets, API integrations, and sensitive transaction data. Secrets include private keys for testing wallets, API credentials for Coinbase's x402 Facilitator, Solana RPC endpoints, and session tokens for Phantom delegation. This document outlines the identification, storage, injection, and rotation of these secrets specifically for the infrastructure layer, ensuring compliance with Devnet isolation, AES-256 encryption, and ephemeral storage practices as defined in the project's security model.

The infrastructure setup leverages Node.js for backend processes, Next.js for frontend visualization, and deployment targets like Vercel for the frontend and Render/Cloudflare Workers for backend APIs. Secrets are never committed to version control; instead, they are managed via environment variables and integrated secrets managers to support autonomous agent operations, such as real-time balance monitoring and transaction signing without exposing mainnet credentials.

This approach aligns with the project's resilience features (e.g., circuit-breaker logic for RPC failures) by ensuring secrets are accessible only during runtime, minimizing exposure in decentralized environments.

## Required Environment Variables and Secrets

The following table lists all project-specific environment variables and secrets, categorized by component. These are derived from the integration needs: Solana/web3.js for transactions, Coinbase x402 SDK for verification, and Phantom session keys for scoped signing. All variables are prefixed with `AUTOPAY_` for namespacing to avoid conflicts in shared environments.

| Variable Name | Type | Description | Usage Context | Default/Required |
|---------------|------|-------------|---------------|------------------|
| `AUTOPAY_SOLANA_RPC_URL` | Secret (URL) | Endpoint for Solana Devnet RPC (e.g., `https://api.devnet.solana.com`). Used by web3.js for transaction submission and balance queries. | Backend (Node.js agent logic), Testing (Jest) | Required; rotate if rate-limited. |
| `AUTOPAY_PHANTOM_PRIVATE_KEY` | Secret (Base58-encoded key) | Private key for a Devnet-only testing wallet (isolated from mainnet). Loaded into ephemeral memory via AES-256 encryption for signing CASH/USDC transactions. Never used for user wallets. | Backend (transaction execution), Phase 1 Demo Mode | Required for autonomy; generate via `solana-keygen` and encrypt before storage. |
| `AUTOPAY_PHANTOM_SESSION_TOKEN` | Secret (JWT-like token) | Time-limited session key for Phantom delegation (e.g., 1-hour validity, scoped to 3 transactions). Enables autonomous signing without full wallet control. | Backend (session-based payments), Phase 2 Interactive Mode | Optional for demo; required for full autonomy. Refresh via Phantom API. |
| `AUTOPAY_COINBASE_FACILITATOR_API_KEY` | Secret (API Key) | API key for Coinbase x402 Facilitator verification, including REST endpoints and WebSocket callbacks for payment authenticity checks. | Backend (verification logic), Audit Trail Logging | Required; supports replay prevention. |
| `AUTOPAY_MARKET_DATA_API_KEY` | Secret (API Key) | Authentication for simulated Market Data API (crypto prices, arbitrage signals). Used in 402 response parsing. | Backend (API request retries), Frontend (visualization) | Optional for Devnet simulation; required for premium endpoint access. |
| `AUTOPAY_KNOWLEDGE_DATA_API_KEY` | Secret (API Key) | Key for Knowledge Data API (AI insights). Integrated into agent prioritization for multi-API monitoring in Phase 3. | Backend (data fetching), Full Autonomy Mode | Optional; used in JSON ledger for audit. |
| `AUTOPAY_DATABASE_URL` | Secret (Connection String) | PostgreSQL URI for Prisma ORM (e.g., `postgresql://user:pass@host:5432/db`). Stores transaction audit trails and low-balance events. | Backend (logging), CI/CD Pipelines | Required if using persistent DB; fallback to local JSON ledger. |
| `AUTOPAY_ENCRYPTION_KEY` | Secret (32-byte key) | AES-256 key for in-memory encryption of session tokens and private keys during runtime. Derived from a secure source like AWS KMS. | Backend (key isolation), All Phases | Required; auto-generated and rotated quarterly. |
| `AUTOPAY_LOG_LEVEL` | Non-Secret (String) | Controls logging verbosity (e.g., `debug` for transaction failures). Not sensitive but influences audit trail exposure. | All Components | Optional; default: `info`. |

**Notes on Usage:**
- In the backend (Node.js with Coinbase x402 SDK), load secrets using `dotenv` in development: `require('dotenv').config();`. For production, inject via platform-specific mechanisms (e.g., Vercel Environment Variables).
- For Solana-specific secrets like `AUTOPAY_PHANTOM_PRIVATE_KEY`, use libraries like `@solana/web3.js` with `Keypair.fromSecretKey()` only after decryption in ephemeral memory. Ensure Devnet isolation by validating the RPC URL starts with `devnet`.
- Frontend (Next.js) secrets are limited to public-facing ones (e.g., API base URLs); sensitive ops like signing are proxied through backend APIs to avoid client-side exposure.

## Secrets Management Tools and Practices

To handle secrets securely in this Solana-integrated web application:

1. **Local Development:**
   - Use `.env.local` files (gitignored) for loading via `dotenv`. Example structure:
     ```
     AUTOPAY_SOLANA_RPC_URL=https://api.devnet.solana.com
     AUTOPAY_PHANTOM_PRIVATE_KEY=your_base58_devnet_key_here
     # ... other vars
     ```
   - Encrypt sensitive files with tools like `git-crypt` or `sops` for team collaboration.

2. **CI/CD Integration:**
   - In pipelines (e.g., GitHub Actions or Render builds), use encrypted secrets stored in the platform's vault. For example, in a Node.js deployment script:
     ```yaml
     # .github/workflows/deploy.yml excerpt
     - name: Inject Secrets
       env:
         AUTOPAY_PHANTOM_PRIVATE_KEY: ${{ secrets.AUTOPAY_PHANTOM_PRIVATE_KEY }}
       run: npm run build
     ```
   - Coordinate with BackendDev: Ensure pipelines decrypt and inject secrets into Docker images using multi-stage builds, where secrets are only present in the final runtime layer.

3. **Production Storage:**
   - **Vercel (Frontend):** Use built-in Environment Variables dashboard. Link to `AUTOPAY_COINBASE_FACILITATOR_API_KEY` for API route security.
   - **Render/Cloudflare Workers (Backend):** Store as service secrets. For Cloudflare, use Workers KV with encryption: `env.AUTOPAY_ENCRYPTION_KEY` for runtime decryption.
   - **Secrets Managers:** Integrate AWS Secrets Manager or HashiCorp Vault for advanced rotation. Example Node.js integration:
     ```typescript
     // utils/secrets.ts
     import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
     const client = new SecretsManagerClient({ region: 'us-east-1' });

     export async function getSecret(secretName: string): Promise<string> {
       const command = new GetSecretValueCommand({ SecretId: secretName });
       const response = await client.send(command);
       return JSON.parse(response.SecretString || '{}')[secretName]; // e.g., fetch 'AUTOPAY_PHANTOM_SESSION_TOKEN'
     }
     ```
     Call this in agent logic before transaction signing, ensuring ephemeral access.

4. **Blockchain-Specific Handling:**
   - For Phantom integration, generate session tokens dynamically via the Phantom API and store encrypted in memory only (no disk persistence). Use `crypto` module for AES-256:
     ```typescript
     import crypto from 'crypto';
     const algorithm = 'aes-256-cbc';
     const key = Buffer.from(process.env.AUTOPAY_ENCRYPTION_KEY!, 'hex');
     const iv = crypto.randomBytes(16);
     const cipher = crypto.createCipher(algorithm, key);
     cipher.setIV(iv);
     let encrypted = cipher.update('sensitive_token', 'utf8', 'hex');
     encrypted += cipher.final('hex');
     // Store iv + encrypted in session; decrypt on use
     ```
   - Audit all accesses in the JSON ledger: Log decryption events with timestamps for Phase 3 multi-API monitoring.

## Security Best Practices

- **Least Privilege:** Scope secrets to Devnet only (e.g., validate `AUTOPAY_SOLANA_RPC_URL` in code to reject mainnet endpoints). Phantom permissions limited to signing; no asset transfers beyond microtransactions.
- **Encryption in Transit/Rest:** All secrets transmitted via HTTPS; at rest, use platform encryption (e.g., Vercel's AES-256). Ephemeral memory for keys during agent runtime to prevent persistence.
- **Access Controls:** Role-based access in secrets managers (e.g., DevOps team only for `AUTOPAY_PHANTOM_PRIVATE_KEY`). Integrate with IAM for AWS-hosted DB secrets.
- **Monitoring and Alerts:** Use tools like Datadog or Render logs to alert on secret access anomalies. Track low-balance events tied to balance queries using `AUTOPAY_SOLANA_RPC_URL`.
- **Compliance:** Aligns with project's Coinbase verification: Every secret-derived transaction (e.g., payments) is checked via Facilitator API to prevent replays.

## Deployment Considerations

- **Docker Integration:** In `Dockerfile` for backend:
  ```
  # infra/Dockerfile
  FROM node:18-alpine
  WORKDIR /app
  COPY . .
  RUN npm ci --only=production
  ENV AUTOPAY_PHANTOM_PRIVATE_KEY=${AUTOPAY_PHANTOM_PRIVATE_KEY}  # Injected at runtime
  CMD ["npm", "start"]
  ```
  Use `--env-file` in `docker run` or Kubernetes secrets for orchestration.

- **Coordination with BackendDev:** Provide a `secrets.template.env` file for local setup, documenting injection points in CI/CD (e.g., Render's Environment tab). Ensure backend APIs (e.g., `/api/pay`) proxy secrets without leaking them to frontend calls.

- **Vercel-Specific:** For Next.js API routes simulating 402 responses, set env vars per environment (Preview/Production) to toggle Devnet vs. simulated data.

## Audit, Rotation, and Maintenance

- **Audit Trail:** Extend the project's JSON ledger to include secret access logs: `{ "event": "secret_decrypt", "secret": "PHANTOM_SESSION", "timestamp": "2023-10-01T12:00:00Z", "agent_phase": 2 }`. Review quarterly for unauthorized access.
- **Rotation Policy:** Rotate all secrets every 90 days or post-incident. Automate with Lambda functions for AWS Secrets Manager (e.g., regenerate `AUTOPAY_PHANTOM_SESSION_TOKEN` via Phantom API).
- **Testing Secrets:** In Jest tests, mock secrets using `jest.mock('dotenv')` to avoid real key exposure. Postman collections should use variables like `${{AUTOPAY_COINBASE_API_KEY}}` from a secure vault.
- **Incident Response:** If a secret is compromised (e.g., RPC key leak), trigger circuit-breaker: Pause agent, rotate all related vars, and notify via low-balance-like events.

This secrets management strategy ensures the Autopay Agent's autonomous x402 flows remain secure, resilient, and scalable, enabling safe demonstration of machine-to-machine payments on Solana. For updates, reference the unique identifier: `1762841338108_autopay_agent_for_x402_autonomous_payments_on_solana__infra_secrets_management_md_ewd88e`.