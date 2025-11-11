# Autopay Agent Backend API Specification

This document provides the OpenAPI 3.0 specification for the backend APIs of the Autopay Agent for x402 Autonomous Payments on Solana. The APIs are designed to support the core functionality of the autonomous agent, including simulation of premium data endpoints (Market Data API and Knowledge Data API), agent orchestration for detecting and handling 402 Payment Required responses, payment execution via Phantom wallet on Solana Devnet, retry mechanisms, balance monitoring, and audit trail management.

The backend is implemented in Node.js with Express, utilizing the Coinbase x402 reference SDK for payment handling and Solana/web3.js for blockchain interactions. All endpoints are secured with API keys (via headers) and rate limiting. The simulated premium APIs return HTTP 402 responses with x402-compliant headers (e.g., `Payment-Network: solana`, `Payment-Methods: CASH`, `Payment-Address: <solana-address>`, `Payment-Facilitator: coinbase`) to trigger autonomous payments. Successful payments are verified via Coinbase's x402 Facilitator API (REST and WebSocket callbacks).

Database interactions use PostgreSQL with Prisma ORM for persistent storage of transaction logs, agent states, and audit trails (supplementing the local JSON ledger for real-time debugging). Endpoints are versioned under `/api/v1/` for future extensibility.

For deployment, these APIs are hosted on Render or Cloudflare Workers, with CORS enabled for the Next.js frontend. Testing is supported via Jest for unit/integration and Postman collections for end-to-end flows.

## OpenAPI YAML Specification

```yaml
openapi: 3.0.0
info:
  title: Autopay Agent API
  description: | 
    APIs for the Autopay Agent, enabling autonomous detection of 402 Payment Required responses, execution of Phantom CASH payments on Solana Devnet, retry of API calls, balance monitoring, and transaction auditing. Supports integration with simulated premium APIs for Market Data (crypto prices, arbitrage signals, sentiment) and Knowledge Data (AI insights). Security features include scoped Phantom session keys, AES-256 encryption, and Coinbase Facilitator verification.
  version: 1.0.0
  contact:
    name: Backend Development Team
    email: dev@autopay-agent.example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
servers:
  - url: https://api.autopay-agent.example.com/api/v1
    description: Production server (Render/Cloudflare Workers)
  - url: http://localhost:3001/api/v1
    description: Local development server (Node.js/Express)
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
      description: API key for authentication (generated via /auth endpoint or env vars for demo)
  schemas:
    ErrorResponse:
      type: object
      properties:
        error:
          type: string
          description: Error message
        code:
          type: integer
          description: HTTP error code
        timestamp:
          type: string
          format: date-time
          description: ISO timestamp of error
      required:
        - error
        - code
    PaymentInstructions:
      type: object
      properties:
        network:
          type: string
          enum: [solana]
          description: Blockchain network (Solana Devnet for demo)
        method:
          type: string
          enum: [CASH, USDC]
          description: Payment method (Phantom CASH or USDC on Devnet)
        address:
          type: string
          description: Solana recipient address for payment
        amount:
          type: number
          format: float
          description: Amount in USD equivalent (microtransaction, e.g., 0.01)
        facilitator:
          type: string
          description: Coinbase Facilitator endpoint for verification
        nonce:
          type: string
          description: Unique nonce to prevent replays
      required:
        - network
        - method
        - address
        - amount
    TransactionStatus:
      type: object
      properties:
        txHash:
          type: string
          description: Solana transaction hash
        status:
          type: string
          enum: [pending, confirmed, failed, rejected]
          description: Transaction state
        retries:
          type: integer
          description: Number of retries attempted (max 3 with exponential backoff)
        confirmedAt:
          type: string
          format: date-time
          description: Confirmation timestamp (if applicable)
        error:
          type: string
          description: Failure reason (e.g., insufficient funds, network issue)
      required:
        - txHash
        - status
    BalanceInfo:
      type: object
      properties:
        cashBalance:
          type: number
          format: float
          description: Available Phantom CASH balance in USD equivalent
        usdcBalance:
          type: number
          format: float
          description: USDC balance on Solana Devnet
        threshold:
          type: number
          format: float
          description: Low-balance threshold (e.g., 0.05 USD)
        lowBalanceAlert:
          type: boolean
          description: True if balance < threshold, triggering pause event
      required:
        - cashBalance
        - usdcBalance
    AgentRequest:
      type: object
      properties:
        endpoint:
          type: string
          description: Target premium API endpoint (e.g., /premium/market-feed)
        params:
          type: object
          description: Query parameters for the API request (e.g., {symbol: 'SOL'})
        autonomyLevel:
          type: string
          enum: [demo, interactive, full]
          description: Autonomy phase (demo: server-only, interactive: browser-triggered, full: multi-API)
      required:
        - endpoint
    AgentResponse:
      type: object
      properties:
        requestId:
          type: string
          description: Unique ID for the agent process
        status:
          type: string
          enum: [initiated, payment_pending, retrying, completed, failed]
          description: Current agent state
        data:
          type: object
          description: Accessed premium data (after successful payment and retry)
        transaction:
          $ref: '#/components/schemas/TransactionStatus'
      required:
        - requestId
        - status
    AuditLogEntry:
      type: object
      properties:
        id:
          type: string
          description: Log entry ID (UUID)
        timestamp:
          type: string
          format: date-time
        type:
          type: string
          enum: [payment_success, payment_failure, api_access, balance_check, circuit_break]
          description: Log type
        details:
          type: object
          description: Additional details (e.g., txHash, error code)
        agentId:
          type: string
          description: Associated agent request ID
      required:
        - id
        - timestamp
        - type
    MarketData:
      type: object
      properties:
        prices:
          type: object
          description: Real-time crypto prices (e.g., {SOL: 150.25, ETH: 3500.00})
        arbitrageSignals:
          type: array
          items:
            type: object
            properties:
              pair:
                type: string
              opportunity:
                type: number
          description: Arbitrage opportunities (e.g., price differences)
        sentiment:
          type: object
          description: Sentiment metrics (e.g., {bullish: 0.65, neutral: 0.25})
      required:
        - prices
    KnowledgeData:
      type: object
      properties:
        insights:
          type: array
          items:
            type: string
          description: Curated AI research insights (e.g., "Solana scalability analysis")
        references:
          type: array
          items:
            type: object
            properties:
              title:
                type: string
              url:
                type: string
          description: Documentation references
      required:
        - insights
security:
  - ApiKeyAuth: []
paths:
  /premium/market-feed:
    get:
      summary: Fetch premium market data feed (simulated 402-protected endpoint)
      description: | 
        Simulates a premium Market Data API. On initial access without prior payment, returns HTTP 402 with x402 instructions for Phantom CASH payment on Solana Devnet. After successful payment and verification, subsequent calls (via agent retry) return real-time crypto data. Data is mocked from Solana Devnet oracles for demo purposes.
      tags:
        - Premium APIs
      parameters:
        - name: symbol
          in: query
          schema:
            type: array
            items:
              type: string
          description: Crypto symbols (e.g., SOL, ETH)
        - name: interval
          in: query
          schema:
            type: string
            enum: [1m, 5m, 1h]
          description: Data interval
      responses:
        '200':
          description: Successful access to premium data (post-payment)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MarketData'
        '402':
          description: Payment Required - Triggers autonomous agent payment flow
          headers:
            Payment-Network:
              schema:
                type: string
              description: solana
            Payment-Methods:
              schema:
                type: string
              description: CASH
            Payment-Address:
              schema:
                type: string
              description: Solana Devnet recipient address
            Payment-Facilitator:
              schema:
                type: string
              description: Coinbase x402 Facilitator URL
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaymentInstructions'
        '400':
          description: Invalid parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '401':
          description: Unauthorized (missing API key)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '5xx':
          description: Server error (e.g., RPC failure - triggers circuit-breaker)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /premium/knowledge-insights:
    get:
      summary: Fetch premium AI knowledge data (simulated 402-protected endpoint)
      description: | 
        Simulates a Knowledge Data API for AI research insights. Returns HTTP 402 with x402 headers on unpaid access. Post-payment retry grants curated insights and references, sourced from simulated paywalled structure on Solana Devnet.
      tags:
        - Premium APIs
      parameters:
        - name: topic
          in: query
          schema:
            type: string
          description: Research topic (e.g., solana-autonomy)
        - name: depth
          in: query
          schema:
            type: string
            enum: [basic, advanced]
          description: Insight depth
      responses:
        '200':
          description: Successful access (post-payment)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/KnowledgeData'
        '402':
          description: Payment Required
          headers:
            Payment-Network:
              schema:
                type: string
              description: solana
            Payment-Methods:
              schema:
                type: string
              description: CASH,USDC
            Payment-Address:
              schema:
                type: string
              description: Solana address
            Payment-Facilitator:
              schema:
                type: string
              description: Verification endpoint
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaymentInstructions'
        '400':
          description: Invalid query
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '429':
          description: Rate limit exceeded (prevents abuse in multi-API mode)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /agent/start:
    post:
      summary: Initiate autonomous agent process
      description: | 
        Starts the Autopay Agent to request premium data, handle 402 detection, execute payment via Phantom session keys (scoped to Devnet), verify via Coinbase Facilitator, and retry the API. Supports configurable autonomy levels. Logs to PostgreSQL and JSON ledger. Monitors balance and applies retries (up to 3 with backoff) or circuit-breaker on failures.
      tags:
        - Agent Orchestration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AgentRequest'
      responses:
        '201':
          description: Agent initiated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AgentResponse'
        '400':
          description: Invalid request (e.g., unknown endpoint)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '402':
          description: Low balance detected - pauses and returns top-up instructions
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BalanceInfo'
        '503':
          description: Circuit-breaker active (network/RPC issue)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /agent/status/{requestId}:
    get:
      summary: Get agent process status
      description: Retrieves real-time status, including payment transaction details, retry count, and accessed data. Useful for frontend visualization of flows and on-chain status.
      tags:
        - Agent Orchestration
      parameters:
        - name: requestId
          in: path
          required: true
          schema:
            type: string
          description: Unique agent request ID
      responses:
        '200':
          description: Status retrieved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AgentResponse'
        '404':
          description: Request ID not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /wallet/balance:
    get:
      summary: Check Phantom wallet balance
      description: Monitors real-time CASH/USDC balance on Solana Devnet. Triggers low-balance event if below threshold, pausing autonomous operations. Uses web3.js for querying without exposing private keys.
      tags:
        - Wallet Management
      responses:
        '200':
          description: Balance info
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BalanceInfo'
        '500':
          description: RPC query failure
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /transactions:
    get:
      summary: List transaction history
      description: Fetches audit trail of payments (success/failure) from PostgreSQL. Includes filters for failed transactions to prevent duplicates. Complements local JSON ledger for transparency.
      tags:
        - Audit Trail
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [all, success, failed]
          description: Filter by status
        - name: limit
          in: query
          schema:
            type: integer
            default: 10
          description: Number of records (max 50)
        - name: since
          in: query
          schema:
            type: string
            format: date-time
          description: Filter from timestamp
      responses:
        '200':
          description: Transaction list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/TransactionStatus'
        '400':
          description: Invalid filters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /audit-logs:
    get:
      summary: Retrieve audit logs
      description: Queries persistent logs from PostgreSQL for all agent activities, including payments, API accesses, balance checks, and circuit-breaks. Ensures compliance and debugging in decentralized environments.
      tags:
        - Audit Trail
      parameters:
        - name: type
          in: query
          schema:
            type: string
            enum: [all, payment_success, payment_failure, api_access, balance_check, circuit_break]
          description: Filter by log type
        - name: agentId
          in: query
          schema:
            type: string
          description: Filter by agent request ID
        - name: page
          in: query
          schema:
            type: integer
            default: 1
          description: Pagination page
        - name: pageSize
          in: query
          schema:
            type: integer
            default: 20
          description: Records per page
      responses:
        '200':
          description: Audit logs
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/AuditLogEntry'
        '404':
          description: No logs found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
tags:
  - name: Premium APIs
    description: Simulated 402-protected endpoints for Market and Knowledge Data
  - name: Agent Orchestration
    description: Endpoints to start and monitor the autonomous payment agent
  - name: Wallet Management
    description: Balance monitoring and low-funds handling
  - name: Audit Trail
    description: Transaction and activity logging for transparency
```

## Additional Implementation Notes

- **x402 Headers**: All 402 responses include custom headers for Solana integration (e.g., `Payment-Network: solana-devnet`, `Payment-Signature-Required: true`). The agent parses these using the Coinbase SDK.
- **Security**: Phantom integration uses session keys (time-limited to 1 hour, scoped to 3 txs) stored ephemerally with AES-256 encryption. Devnet isolation prevents mainnet exposure. All endpoints require `X-API-Key` header.
- **Error Handling**: Standardized `ErrorResponse` schema. 5xx errors trigger circuit-breaker (queues payments, resumes on RPC restore).
- **Resilience**: Payment endpoint logic includes exponential backoff (e.g., 1s, 2s, 4s retries). Balance checks run pre-payment.
- **Frontend Coordination**: These APIs align with Next.js frontend for real-time UI updates (e.g., WebSocket for status via optional /ws endpoint, not spec'd here). ProductManager requirements for multi-API monitoring in Phase 3 are supported via /agent/start params.
- **Database Schema Snippet (Prisma)**: Relevant models include `AgentRequest`, `Transaction`, `AuditLog` with fields matching schemas above (e.g., `model Transaction { id String @id @default(uuid()) txHash String status String ... }`).
- **Testing**: Postman collection available in repo for simulating 402 -> payment -> retry flow. Jest tests cover edge cases like insufficient funds.

This specification is unique to the backend APIs and complements frontend API contracts without overlap. For updates, reference unique ID: 1762841338103_autopay_agent_for_x402_autonomous_payments_on_solana__backend__apis_openapi_md_uqb8zj.