# Autopay Agent for x402 Autonomous Payments on Solana

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana Devnet](https://img.shields.io/badge/Blockchain-Solana%20Devnet-blue.svg)](https://devnet.solana.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)

## Project Overview

The **Autopay Agent** is an innovative, fully autonomous web application that powers the x402 economy by seamlessly handling HTTP 402 "Payment Required" responses in premium API ecosystems. Built on Solana Devnet, this agent detects paywalls in real-time data sources, executes microtransactions using Phantom CASH (or USDC equivalents) via the Phantom wallet, and automatically retries API requests to unlock premium content. 

Designed for the machine-to-machine (M2M) economy, the agent demonstrates a complete x402 protocol flow: from payment detection and blockchain execution to post-payment access and resilience in decentralized environments. It integrates with simulated premium APIs, including a Market Data API for crypto prices, arbitrage signals, and sentiment analysis, and a Knowledge Data API for AI-driven research insights. All interactions are observable through a Next.js-based frontend, with backend logic ensuring secure, non-blocking operations.

This project targets API developers monetizing microtransactions, blockchain builders exploring autonomous agents, hackathon participants showcasing Solana payments, and researchers advancing AI-market data integrations. By enabling configurable autonomy—from server-hosted demos to multi-API monitoring—the agent showcases how decentralized systems can transact value and knowledge autonomously, paving the way for a frictionless Web3 economy.

**Unique Project Identifier:** 1762841338036_autopay_agent_for_x402_autonomous_payments_on_solana_README_md_mtdie

## Key Features

- **402 Response Detection & Parsing**: Automatically identifies HTTP 402 errors from premium APIs and extracts x402 payment instructions, such as amount, token type (Phantom CASH/USDC), and facilitator details.
  
- **Autonomous Solana Payments**: Integrates with Phantom wallet for scoped, session-based transaction signing on Solana Devnet. Executes payments via Coinbase's x402 Facilitator API, supporting real-time verification with REST and WebSocket callbacks.

- **Post-Payment Retry Mechanism**: Retries original API calls immediately after successful transaction confirmation, granting access to restricted endpoints like `/api/market-feed` (crypto metrics) or `/api/knowledge-insights` (AI research data).

- **Premium API Integrations**:
  - **Market Data API**: Simulated paywalled endpoints delivering real-time crypto prices, arbitrage opportunities, and sentiment scores—ideal for trading bots or analytics tools.
  - **Knowledge Data API**: Curated AI insights and documentation, served via Next.js routes, representing microtransaction-enabled knowledge bases.

- **Resilience & Fallback System**:
  - Payment retries: Up to 3 attempts with exponential backoff (e.g., 1s, 2s, 4s delays) for failures like transaction rejection or facilitator errors.
  - Balance Monitoring: Real-time checks on Phantom CASH/USDC Devnet balance; triggers "Low Balance" events and pauses operations if below threshold (e.g., 0.01 SOL equivalent), with instructions for top-ups.
  - Network Circuit-Breaker: Queues payments during RPC/network outages and resumes upon restoration, preventing cascading failures in decentralized setups.
  - Audit Trail: Comprehensive logging of all transactions (success/failure) to a local JSON ledger (`./logs/transaction-audit.json`), including hashes, timestamps, and error classifications for debugging and compliance.

- **Secure Phantom Wallet Integration**:
  - Scoped permissions: Requests only transaction-signing access, avoiding full wallet control.
  - Session Delegation: Uses time-limited (e.g., 1-hour) and scope-limited (e.g., 3 transactions) Phantom Session Keys for automation.
  - Encryption & Isolation: AES-256 encryption for keys/tokens, stored in ephemeral memory; all operations restricted to Solana Devnet to isolate from mainnet risks.
  - Facilitator Verification: Every payment cross-checked via Coinbase's API to prevent replays or spoofs.

- **Configurable Autonomy Levels**:
  - **Phase 1 (Demo Mode)**: Server-hosted Node.js process for autonomous single-API requests, payments, and logging—perfect for hackathon demos.
  - **Phase 2 (Interactive Mode)**: Browser-based agent via Phantom extension, enabling user-approved payments with live UI feedback on transaction status.
  - **Phase 3 (Full Autonomy)**: Monitors multiple APIs concurrently, prioritizing requests based on fund availability and data freshness (e.g., fetch market feeds before stale AI insights).

- **Visualization & Observability**: Real-time frontend dashboard displaying payment flows, on-chain transaction status, balance updates, and audit logs—making the x402 flow transparent and educational.

## Architecture

The Autopay Agent follows a modular web application architecture optimized for developer velocity and blockchain reliability:

- **Frontend Layer**: Next.js (App Router) with React and TypeScript for dynamic UI components. Uses TailwindCSS for styling and Zustand for state management (e.g., tracking transaction states and API responses). Visualizes key metrics like pending payments, balance, and retry attempts.

- **Backend Layer**: Node.js with TypeScript, leveraging Express for API routing. Core logic uses the Coinbase x402 reference SDK for payment handling and `@solana/web3.js` for blockchain interactions. Next.js API routes serve simulated premium data and host audit logs.

- **Blockchain Integration**: Solana Devnet for all transactions. Payments use Phantom CASH (native to Phantom wallet) or USDC spl-token, with RPC calls to devnet endpoints. Facilitator verification ensures secure, atomic swaps.

- **Data & Persistence**: Local JSON ledger for transaction audits; optional PostgreSQL with Prisma ORM for scalable logging in production (e.g., storing historical payment analytics).

- **Flow Diagram** (High-Level):
  ```
  API Request → 402 Response Detected → Parse x402 Instructions
                 ↓
  Check Balance → Execute Payment (Phantom + Solana) → Verify via Facilitator
                 ↓
  Retry API → Access Premium Data → Log to Audit Trail → Update UI
  ```

For detailed specs, see `./docs/architecture.md` (generated by BackendDev) and `./frontend/src/components/PaymentFlow.tsx` (generated by FrontendDev).

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React 18, TypeScript 5, TailwindCSS, Zustand (state management).
- **Backend**: Node.js 20+, Express/NestJS (optional for structured APIs), TypeScript, Coinbase x402 SDK, `@solana/web3.js`.
- **Blockchain**: Solana Devnet, Phantom Wallet SDK, USDC SPL Token.
- **Verification & Security**: Coinbase x402 Facilitator API (REST/WebSockets), AES-256 encryption (via `crypto` module), Phantom Session Keys.
- **Database/Logging**: Local JSON (primary), PostgreSQL + Prisma ORM (extensible).
- **Testing**: Jest for unit/integration tests, Postman for API simulations (e.g., mocking 402 responses).
- **Deployment**: Vercel for frontend, Render/Cloudflare Workers for backend, Docker for containerization.
- **Dev Tools**: ESLint/Prettier for code quality, Husky for pre-commit hooks.

Future extensibility includes Rust for custom Solana programs (e.g., on-chain payment escrow).

## Quick Start

### Prerequisites
- Node.js 20+ and npm/yarn.
- Phantom Wallet browser extension installed and connected to Solana Devnet.
- Solana CLI: `sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"` (for local testing).
- Fund your Phantom wallet with Devnet SOL/USDC via faucet (e.g., `solfaucet.com`).

### Installation
1. Clone the repository:
   ```
   git clone https://github.com/your-org/autopay-agent-for-x402-autonomous-payments-on-solana.git
   cd autopay-agent-for-x402-autonomous-payments-on-solana
   ```

2. Install dependencies for the entire workspace:
   ```
   npm install
   ```

3. Copy `config/env.example` to `config/env.local` (or create your own) and adjust the values:
   ```
  cp config/env.example config/env.local
  # edit config/env.local to point at your Devnet RPC, facilitator key, etc.
   ```

4. Initialise the SQLite database and generate the Prisma client (only required the first time or after schema changes):
   ```
   npm run prisma:migrate --workspace backend
   ```

5. Start both backend (Express + Prisma) and frontend (Next.js) in parallel:
   ```
   npm run dev
   ```
  - Backend runs on `http://localhost:4000`
  - Frontend dashboard runs on `http://localhost:3000`

6. Visit `http://localhost:3000` to open the dashboard, trigger premium API requests, monitor payment retries, and inspect the live ledger.

### Demo Usage
1. Navigate to `/dashboard` in the browser.
2. Click "Request Market Data" to simulate a premium API call.
3. Observe the 402 detection, Phantom payment prompt (approve in wallet), and successful data access.
4. Check `./logs/transaction-audit.json` for the audit trail.
5. For autonomy testing: Run `npm run agent:demo` (Node.js script) to execute Phase 1 without UI.

Example API Simulation (via curl for backend testing):
```
curl -X GET http://localhost:3000/api/market-feed \
  -H "Accept: application/json"
```
This triggers the full flow: 402 → Payment → Retry → Data response.

## Security Considerations

Security is paramount for autonomous agents handling real-value transactions:
- **Wallet Safety**: Never store private keys; use session-based delegation only.
- **Input Validation**: Sanitize all x402 headers to prevent injection attacks.
- **Rate Limiting**: Backend APIs enforce limits (e.g., 10 req/min) to mitigate abuse.
- **Compliance**: All Devnet operations; mainnet migration requires additional audits.
- For full details, review `./docs/security-audit.md`.

## Testing

- **Unit Tests**: `npm test` (Jest covers payment parsing, retry logic, balance checks).
- **Integration Tests**: Simulate full flows with mocked Phantom and Solana RPC.
- **E2E Tests**: Use Playwright for frontend interactions (e.g., wallet approval simulation).
- API Testing: Postman collection in `./tests/postman/` for 402 scenarios.
- Workspace command summary:
  - `npm run test` runs the backend + frontend Jest suites.
  - `npm run lint` executes ESLint for both services.

Aim for 90%+ coverage on core agent logic.

## Deployment

1. **Frontend (Vercel)**:
   ```
   npm run build
   vercel --prod
   ```
   Environment vars auto-synced from Vercel dashboard.

2. **Backend (Render/Cloudflare)**:
   - Dockerize: Build with `docker build -t autopay-agent .`.
   - Deploy to Render: Connect Git repo, set env vars, and scale to 1 instance.
   - For Workers: Adapt Express routes to Cloudflare-compatible format.

3. **Monitoring**: Integrate Sentry for error tracking and Solana Explorer links for tx verification.

Production tip: Use AWS Secrets Manager for sensitive keys; enable HTTPS enforcement.

## Contributing

We welcome contributions to enhance autonomy, add new API integrations, or optimize Solana performance. Fork the repo, create a feature branch (`git checkout -b feature/autonomy-phase3`), and submit a PR with tests.

1. Install dev deps: `npm install`.
2. Run linter: `npm run lint`.
3. Submit PRs to `main` branch.

See `./CONTRIBUTING.md` for guidelines. Join our Discord (link in issues) for hackathon discussions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with ❤️ for the x402 and Solana ecosystems.
- Thanks to Coinbase for the x402 SDK and Phantom team for wallet innovations.
- Inspired by M2M economy visions from API monetization pioneers.

For issues or demos, open a GitHub issue or reach out via [project contact](mailto:autopay-agent@example.com). Let's build the autonomous Web3 future!