# Security Overview

## Secrets Management
- Configure `SECRETS_PROVIDER` to `aws` to pull runtime configuration from AWS Secrets Manager before the application boots.
- Set `AWS_REGION` and `AWS_SECRETS_MANAGER_SECRET_ID` to point at a JSON secret whose keys map to expected environment variables (e.g. `ADMIN_API_KEY`, `PHANTOM_SESSION_PRIVATE_KEY`).
- In development, keep `SECRETS_PROVIDER=env` and rely on `.env` files or Doppler CLI to populate `process.env` directly.
- All secrets retrieved from AWS are only applied when the corresponding environment variable is undefined, allowing emergency overrides via the process environment.

### Secret Rotation
- Rotate sensitive keys (admin API key, facilitator secrets, wallet keys) in AWS Secrets Manager and redeploy. Because runtime variables are loaded on boot, a restart is sufficient to pick up the new values.
- For Doppler-based workflows, use `doppler secrets rotate` and restart the service.
- When rotating the Phantom wallet keypair, update both the session private key and the public address, then immediately invalidate any outstanding sessions.

## HTTPS & Network Controls
- The application enforces HTTPS in non-development environments and trusts `X-Forwarded-Proto` when running behind a proxy. Ensure your reverse proxy/app gateway forwards this header.
- `ALLOWED_ORIGINS` (comma-separated) defines the only origins permitted by CORS.
- `/api/logs`, `/api/autonomy`, `/api/sessions`, and `/api/events` require an admin token for access. Provide the token via `Authorization: Bearer <ADMIN_API_KEY>` or `?token=` query parameter (for SSE/EventSource).

## Wallet Custody Guidelines
- Store Phantom session and custodial keys exclusively in the secrets manager with least-privilege IAM policies.
- When generating a new wallet keypair:
  1. Create the keypair offline and import the secret into the secrets manager.
  2. Update `PHANTOM_SESSION_PRIVATE_KEY` and associated public key in the secret payload.
  3. Restart the backend to hydrate the new keys; confirm Devnet connectivity before sunsetting the old wallet.
  4. Document the rotation in your change log.
- Maintain an audit trail of wallet operations through the ledger stream and database-backed ledger export (`/api/logs/ledger` or `/api/logs/ledger/export`).


