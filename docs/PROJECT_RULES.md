# Project Rules and Guidelines

## Overview

This document outlines the mandatory rules and guidelines for contributing to, developing, and maintaining the **Autopay Agent for x402 Autonomous Payments on Solana** project. These rules ensure consistency, security, reliability, and alignment with the project's core objectives: demonstrating a complete x402 economy flow through autonomous detection of HTTP 402 Payment Required responses, execution of Phantom CASH payments on Solana Devnet, and seamless retry of API calls to access premium data sources like Market Data API (crypto prices, arbitrage signals, sentiment metrics) and Knowledge Data API (AI research insights).

All contributors must adhere to these rules to maintain the project's high standards for decentralized machine-to-machine transactions. Violations may result in code rejection or project delays. This document complements the [README.md](../README.md) (project overview), [db/schema.md](../db/schema.md) (database structure), and [db/migrations.md](../db/migrations.md) (database evolution), focusing exclusively on operational and behavioral guidelines.

**Unique Identifier:** 1762841361796_autopay_agent_for_x402_autonomous_payments_on_solana__docs_PROJECT_RULES_md_0l1tlb  
**Version:** 1.0 (Initial Draft - Aligned with Workflow Steps 1-4)  
**Last Updated:** [Insert Date]  
**Enforced By:** Product Manager Agent

## 1. Contribution Rules

- **Access Control:** Only authorized contributors (core team, hackathon participants with approval) may push to the main branch. All changes must originate from feature branches named `feature/[description]-[ticket-id]`, e.g., `feature/402-detection-001`. Use pull requests (PRs) for review, requiring at least one approval from a backend or frontend lead before merging.
  
- **Commit Standards:** Commits must follow Conventional Commits format: `type(scope): description`, e.g., `feat(autopay-agent): implement exponential backoff for payment retries`. Include references to related issues or user stories from the project's backlog. No commits directly to `main` or `develop` branches.

- **Branch Protection:** The `main` branch is protected against direct pushes, force pushes, and deletions. Merges require passing CI/CD checks, including linting, tests, and security scans. Delete feature branches post-merge to keep the repository clean.

- **External Dependencies:** All new dependencies (e.g., for Solana/web3.js or Coinbase x402 SDK) must be justified in the PR description, vetted for security (no known vulnerabilities via `npm audit`), and pinned to specific versions in `package.json`. Prohibit dependencies that could expose private keys or wallet data.

- **Hackathon-Specific Rule:** During demo phases, temporary branches like `demo/phase-[1-3]` are allowed for rapid iteration, but they must not alter production code paths. Phase 1 (server-hosted Node.js demo) branches require explicit logging of all simulated 402 responses and payments.

## 2. Coding Standards

- **Language and Style:** Use TypeScript exclusively for all backend (Node.js) and frontend (Next.js) code. Enforce strict typing, no `any` types except in SDK integrations (e.g., Phantom session keys) with explicit comments justifying their use. Follow Airbnb style guide with ESLint configuration tailored for Solana integrations—e.g., prefer async/await over Promises for transaction handling.

- **Modular Architecture:** 
  - Backend logic (agent autonomy, 402 detection, payment execution) must be modularized into services: `PaymentService` for Phantom CASH/USDC transactions, `RetryService` for API retries with exponential backoff (up to 3 attempts, starting at 1s delay), and `AuditService` for JSON ledger logging.
  - Frontend components must use React hooks for state management (Zustand preferred over Redux for simplicity in visualizing payment flows and on-chain status). No direct blockchain calls from frontend—route through backend APIs to isolate keys.
  - Adhere to SOLID principles: Single Responsibility for classes handling x402 parsing (e.g., extract payment instructions from 402 headers without mixing with Solana RPC calls).

- **Error Handling:** All functions must handle errors gracefully, classifying them as `PaymentFailure`, `InsufficientFunds`, `NetworkIssue`, or `VerificationError`. Log errors to the JSON audit trail with timestamps, hashes (for failed txns), and context (e.g., API endpoint like `/api/market-feed`). Implement circuit-breaker logic: Pause operations on RPC failures (Solana Devnet) and queue payments for resumption.

- **Autonomy Configuration:** Code must support three phases without duplication:
  - Phase 1: Server-side only (Node.js process)—no UI interactions.
  - Phase 2: Browser-based with manual Phantom approvals.
  - Phase 3: Full autonomy with multi-API prioritization (e.g., fetch Market Data first if funds > threshold, then Knowledge Data).
  Use environment variables (e.g., `AUTONOMY_PHASE=1`) to toggle modes, ensuring Phase 3 includes real-time balance monitoring via Solana/web3.js queries.

- **API-Specific Rules:** Simulated premium APIs (via Next.js routes) must always return standardized 402 responses with x402 instructions (e.g., CASH amount, facilitator URL). Backend requests to these APIs (e.g., `/api/market-feed`) must parse headers using Coinbase x402 SDK before triggering payments—no hardcoding of endpoints.

- **Performance Rules:** Limit concurrent API requests to 5 (to avoid rate-limiting on Devnet). Use memoization for repeated balance checks in Phantom integration. Backend endpoints (e.g., `/api/retry-payment`) must respond within 5s, or trigger fallback logging.

## 3. Security Guidelines

- **Wallet and Key Management:** Phantom integration is restricted to scoped permissions: Request only `signTransaction` for CASH payments, using session keys (time-limited to 1 hour or 3 txns). Store keys/tokens in ephemeral memory only—AES-256 encryption required for any serialization. Isolate all operations to Solana Devnet; prohibit mainnet references in code. Use Coinbase Facilitator API for every payment verification (REST for init, WebSocket for callbacks)—reject unverified txns.

- **Data Protection:** Encrypt audit trail JSON files (local ledger) at rest using Node.js crypto module. Never commit sensitive data (e.g., wallet addresses, tx hashes from real tests) to git—use `.gitignore` for logs and env files. Frontend must not store session tokens in localStorage; use secure HTTP-only cookies for any delegation.

- **Input Validation:** Sanitize all API inputs (e.g., 402 header payloads) against injection attacks. Validate Solana addresses and amounts before transaction signing. For premium API simulations, enforce paywall logic: Free tier returns partial data; 402 only for full access.

- **Compliance Rules:** Adhere to x402 protocol specs—no modifications to payment flows that could enable replay attacks. In Phase 2 (interactive mode), require explicit user consent for each payment via Phantom UI. Monitor for low-balance events (< 0.01 USDC) and halt autonomy without top-up simulation.

- **Vulnerability Scanning:** Run `npm audit` and Solana-specific tools (e.g., Anchor security checks if Rust is added later) on every PR. Prohibit code that could leak RPC endpoints or facilitator credentials.

## 4. Testing Requirements

- **Unit and Integration Tests:** Achieve 90% coverage using Jest. Test core flows end-to-end: 402 detection → payment execution → retry → data access. Mock Solana Devnet RPCs for payment simulations; use real Devnet for verification tests. Include edge cases: Failed confirmations (retry 3x), insufficient funds (trigger pause), network drops (circuit-breaker activation).

- **API Testing:** Use Postman collections for simulating premium APIs (Market/Knowledge Data). Each collection must test x402 flows: Send 402 response → Agent pays → Verify access. Backend APIs (e.g., facilitator callbacks) require WebSocket mocks.

- **Autonomy Testing:** Phase-specific suites:
  - Phase 1: Headless Node.js tests for server autonomy.
  - Phase 2: Browser tests with Puppeteer simulating Phantom approvals.
  - Phase 3: Load tests for multi-API monitoring (e.g., 10 concurrent requests prioritized by funds).
  
- **Security Testing:** Include OWASP ZAP scans for frontend and backend. Test Phantom session delegation for key isolation. Audit trail tests: Ensure all txns (success/fail) are logged immutably to JSON without duplication.

- **CI/CD Integration:** GitHub Actions workflow must run tests on PRs, failing if coverage drops or security issues are found. No deployment without passing tests.

## 5. Deployment and Operations Rules

- **Environment Separation:** Use distinct configs: `dev` (local Devnet), `staging` (Vercel preview), `prod` (Render/Cloudflare for backend, Vercel for frontend). Devnet-only for all blockchain ops—no mainnet deployments without explicit approval.

- **Deployment Process:** Backend deploys via Docker containers on Render (Node.js/Express). Frontend on Vercel with App Router. Use Prisma for any DB migrations (align with [db/migrations.md](../db/migrations.md)). Post-deploy, run health checks: Verify agent can detect a simulated 402 and log to audit trail.

- **Monitoring and Logging:** Integrate Sentry for error tracking, focused on payment/retry failures. All logs must include context (e.g., API type: Market vs. Knowledge). Rotate JSON ledger files daily to prevent bloat.

- **Rollback Rules:** If a deployment introduces payment failures >5%, auto-rollback via CI/CD. Maintain versioned backups of audit trails for debugging x402 flows.

## 6. Documentation Standards

- **Inline Documentation:** JSDoc for all public functions, especially payment/retry logic (e.g., explain exponential backoff formula: `delay = initial * Math.pow(2, attempt - 1)`). Comment Solana-specific code (e.g., `Connection` setup for Devnet).

- **Update Requirements:** Any code change affecting features (e.g., new retry threshold) must update related docs. This file itself must be versioned on changes.

- **Demo Documentation:** For hackathons, include runnable scripts in `/scripts/demo-phase-[1-3].ts` with setup rules (e.g., fund Phantom wallet with Devnet USDC via faucet).

## Enforcement and Exceptions

- **Reviews:** Product Manager reviews all PRs for rule compliance. BackendDev and FrontendDev must flag deviations during coordination.
- **Exceptions:** Rare, must be documented in PR (e.g., hackathon time constraints for Phase 3 prioritization). No exceptions for security rules.
- **Feedback Loop:** Contribute suggestions to this doc via issues labeled `docs-improvement`.

By following these rules, we ensure the Autopay Agent remains a robust, secure demonstration of x402 autonomous payments, advancing decentralized economies on Solana. For questions, reference workflow context from Steps 1-4 or contact the Product Manager.