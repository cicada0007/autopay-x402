# CI/CD Pipeline Configuration for Autopay Agent

## Overview

The CI/CD pipeline for the Autopay Agent project automates the build, test, deployment, and monitoring processes to ensure reliable releases of the autonomous x402 payment system on Solana Devnet. This configuration supports the project's dual-stack architecture: a Next.js frontend for visualization and interaction, and a Node.js/TypeScript backend for agent logic, Solana transaction handling via web3.js, and integration with Coinbase's x402 Facilitator API.

The pipeline emphasizes:
- **Security**: Handling sensitive elements like Phantom Wallet session keys and Devnet private keys through encrypted secrets and ephemeral storage.
- **Resilience Testing**: Simulating 402 responses, payment retries, and network failures specific to Solana RPC interactions.
- **Autonomy Levels**: Separate workflows for Phase 1 (server-hosted demo), Phase 2 (browser-based), and Phase 3 (multi-API monitoring).
- **Deployment Targets**: Vercel for frontend (with preview environments), Render for backend APIs (with auto-scaling), and Cloudflare Workers for lightweight facilitator verification endpoints.
- **Observability**: Integration with JSON audit trails, on-chain transaction logging, and Postman collections for end-to-end flow validation.

We use **GitHub Actions** as the orchestration tool, leveraging matrix strategies for multi-environment testing (Devnet/Staging/Production). Pipelines trigger on pull requests (PRs), merges to `main`, and scheduled runs for balance monitoring simulations. All artifacts are stored in GitHub Packages for versioning.

## Prerequisites

- **Repository Setup**: GitHub repository with branches: `main` (production), `develop` (staging), `feature/*` (development).
- **Secrets Management**:
  - `SOLANA_DEVNET_RPC_URL`: Solana Devnet endpoint (e.g., `https://api.devnet.solana.com`).
  - `PHANTOM_SESSION_KEY`: Encrypted session token for wallet delegation (AES-256 via GitHub Secrets).
  - `COINBASE_FACILITATOR_API_KEY`: API key for x402 verification.
  - `VERCEL_TOKEN`: For frontend deployments.
  - `RENDER_API_KEY`: For backend deployments.
  - `USDC_DEVNET_MINT`: Mint address for test USDC tokens.
- **Tools**:
  - Node.js 20.x (via `setup-node` action).
  - Yarn as package manager for consistency.
  - Docker for containerized backend tests.
- **Dependencies**: Install via `yarn install --frozen-lockfile` to ensure reproducible builds.

## Pipeline Workflows

### 1. Continuous Integration (CI) Workflow: `ci.yml`

This workflow runs on every PR and push to `develop`/`main`. It focuses on linting, unit/integration tests, and static analysis tailored to the project's Solana and x402 specifics.

#### Triggers
- `pull_request`: On `develop` and `main` branches.
- `push`: To `develop` and `main`.

#### Jobs

- **Lint & Format**:
  - Runs ESLint (TypeScript rules extended for Solana/web3.js) and Prettier on all files.
  - Excludes `node_modules` and `.next`.
  - Fails if Solana keypair files (e.g., `devnet-wallet.json`) are committed (git-secrets check).
  - Command: `yarn lint && yarn format:check`.

- **Unit Tests (Jest)**:
  - Matrix: OS (ubuntu-latest), Node (20).
  - Covers backend: x402 response parsing, Phantom CASH transaction signing, retry logic with exponential backoff (mocks Solana RPC failures).
  - Covers frontend: React components for payment flow UI, Zustand state for real-time balance monitoring.
  - Includes coverage thresholds: 85% for agent logic, 90% for security modules (e.g., AES-256 encryption).
  - Command: `yarn test:unit --coverage --watchAll=false`.
  - Artifacts: Upload coverage reports to GitHub Actions.

- **Integration Tests**:
  - Spins up a local Next.js dev server and mocks Solana Devnet via `@solana/web3.js` test utils.
  - Tests end-to-end flows: Simulate 402 from Market Data API (/api/market-feed), execute USDC payment, verify via Facilitator API WebSocket callback, retry and access data.
  - Includes Knowledge Data API simulation: Paywall AI insights endpoint.
  - Handles edge cases: Low balance triggers, circuit-breaker on RPC timeouts, duplicate transaction prevention via hash checks.
  - Uses Jest with `supertest` for API routes and Puppeteer for frontend e2e (headless Chrome).
  - Command: `yarn test:integration`.
  - Environment: Injects Devnet secrets for realistic transaction simulation (no real on-chain spends).

- **Security Scan**:
  - Runs `npm audit` and Snyk for vulnerabilities in dependencies (e.g., web3.js, @solana/wallet-adapter).
  - Scans for exposed keys in code using Trivy (Docker image scan for backend).
  - Ensures session keys are only in ephemeral memory (no persistent storage).

- **Build Validation**:
  - Builds frontend: `yarn build` (Next.js, outputs to `.next`).
  - Builds backend: `yarn build` (TypeScript transpile, Docker build for Render).
  - Verifies no build errors in autonomy phases (e.g., multi-API monitoring config).

#### Success Criteria
- All jobs must pass; PRs require approval from BackendDev for deployment-related changes.
- Notifications: Slack webhook on failure, tagging DevOps and BackendDev.

### 2. Continuous Deployment (CD) Workflow: `cd.yml`

Deploys to staging on `develop` merges and production on `main` merges. Uses environment-specific approvals.

#### Triggers
- `push`: To `develop` (staging) or `main` (production).

#### Jobs

- **Frontend Deployment (Vercel)**:
  - Installs dependencies and builds Next.js app.
  - Deploys to Vercel with environment vars: `NEXT_PUBLIC_SOLANA_NETWORK=devnet`, `COINBASE_FACILITATOR_WS_URL`.
  - Preview URLs for PRs; aliases for staging/prod (e.g., `autopay-agent-staging.vercel.app`).
  - Post-deploy: Runs smoke tests via Vercel Speed Insights, verifying UI loads payment logs and on-chain status.
  - Coordinates with FrontendDev: Exposes API routes for Market/Knowledge Data simulation.

- **Backend Deployment (Render)**:
  - Builds Docker image: Node.js base, installs web3.js and x402 SDK.
  - Pushes to Render via API: Auto-deploys service with env vars (e.g., `SOLANA_RPC_URL`, `PHANTOM_PRIVATE_KEY` encrypted).
  - Includes Cloudflare Workers sub-job: Deploys facilitator verification script (lightweight JS for WebSocket callbacks).
  - Health check: POST to `/health` endpoint, simulating a 402-to-payment flow.
  - Scaling: Render auto-scales based on Solana transaction volume; Workers for low-latency verification.

- **Database & Infra Sync**:
  - If using PostgreSQL (for audit trail persistence beyond JSON ledger): Runs Prisma migrations via `yarn prisma migrate deploy`.
  - Deploys infra code (if any Terraform/IaC): Applies changes to AWS Fargate for optional containerized agent runs.
  - Solana-specific: Funds Devnet wallet post-deploy via airdrop script (USDC minting).

- **Post-Deployment Testing**:
  - End-to-end with Postman: Collection runs simulating full x402 flow (402 detection → payment → retry → data access).
  - Monitors for 3 retries on failures, low-balance events, and circuit-breaker activation.
  - On-chain verification: Queries Solana explorer for transaction signatures, ensures no duplicates.
  - Rollback: If tests fail, tags previous commit and notifies BackendDev for manual intervention.

#### Environment-Specific Configurations
- **Staging**: Devnet only, relaxed retry thresholds (5 attempts), verbose logging to JSON ledger.
- **Production**: Full autonomy (Phase 3), strict security (session keys expire after 1 hour), integration with real-time multi-API polling (prioritize by funds/data freshness).
- Approvals: GitHub environments require BackendDev review for prod deploys.

### 3. Scheduled Maintenance Workflow: `maintenance.yml`

#### Triggers
- Cron: Daily at 02:00 UTC.

#### Jobs
- **Balance Check**: Script monitors Phantom/USDC Devnet balance; triggers top-up alert if < threshold (e.g., 0.1 SOL equivalent).
- **Test Data Refresh**: Re-airdrop USDC to test wallet, reset simulated API paywalls.
- **Vulnerability Scan**: Full dependency update check and audit.
- **Cleanup**: Prune old Docker images and Vercel previews (>7 days).

## Monitoring and Observability

- **Tools**: Integrate Sentry for error tracking (e.g., RPC failures), Datadog for pipeline metrics (deploy time, test coverage).
- **Audit Integration**: Pipeline outputs append to central JSON ledger (`/logs/transactions.json`), versioned per release.
- **Custom Metrics**: Track x402 flow success rate (e.g., % of 402s resolved via payment), retry efficiency.
- **Alerts**: PagerDuty for critical failures (e.g., deployment halts on security scan fails).

## Coordination with BackendDev

- **API Endpoints**: CD ensures backend exposes `/api/agent/pay` (for Phantom signing) and `/api/verify` (Facilitator callback), documented in OpenAPI spec auto-generated during build.
- **Deployment Hooks**: BackendDev can trigger manual deploys via GitHub API for hotfixes (e.g., Solana program updates).
- **Secrets Rotation**: Quarterly rotation of Phantom session keys, coordinated via shared docs.
- **Extensibility**: Pipeline supports future Rust Solana programs by adding Cargo build steps in matrix.

## Best Practices and Versioning

- **Branching**: Git Flow model; releases tagged as `v1.0.0` (SemVer).
- **Rollback Strategy**: Blue-green deploys on Render; Vercel rollbacks via CLI.
- **Cost Optimization**: Use Vercel hobby tier for dev, pro for prod; Render free for low-traffic staging.
- **Compliance**: All pipelines log to SOC2-compliant GitHub Audit Log; no mainnet keys in CI.

This CI/CD setup ensures the Autopay Agent remains robust, secure, and scalable, enabling seamless demonstrations of autonomous x402 payments on Solana. For updates, reference ticket #1762841338074 in the project board.