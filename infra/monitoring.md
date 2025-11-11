# Monitoring and Logging Setup for Autopay Agent

## Overview

The Autopay Agent for x402 Autonomous Payments on Solana requires robust monitoring and logging to ensure reliability in a decentralized environment. This setup focuses on observability across the full stack: backend agent logic (Node.js/TypeScript with Solana/web3.js and Coinbase x402 SDK), frontend visualization (Next.js), blockchain interactions (Solana Devnet via Phantom CASH/USDC), and external integrations (Coinbase Facilitator API). Monitoring emphasizes key events like 402 Payment Required detections, transaction signing/failures, API retries, balance thresholds, and network resilience.

The strategy aligns with production resilience needs:
- **Logging**: Structured, auditable trails for all agent actions, including the JSON ledger for transaction audits.
- **Metrics**: Real-time tracking of performance, success rates, and resource usage.
- **Alerting**: Proactive notifications for critical issues like low balances, payment failures, or RPC outages.
- **Tracing**: Distributed tracing for end-to-end flows (e.g., 402 detection → payment → retry).
- **Tools Integration**: Leverages cloud-native services for deployment targets (Vercel, Cloudflare Workers, Render, AWS Fargate/Lambda) while supporting Dockerized local development.

This configuration ensures the agent operates as a semi-autonomous economic entity, with transparency for debugging multi-API monitoring (Market Data API for crypto prices/arbitrage/sentiment, Knowledge Data API for AI insights) and Phase 3 full autonomy.

## Logging Configuration

Logging is centralized and structured using Winston (for Node.js backend) and Pino (for high-performance in Cloudflare Workers). All logs are JSON-formatted for easy parsing, with correlation IDs for tracing agent sessions. Logs capture:
- 402 response parsing (e.g., payment instructions from x402 headers).
- Phantom wallet interactions (session key delegation, signing events).
- Solana transaction details (hashes, confirmations, USDC/CASH transfers).
- Retry events (exponential backoff, up to 3 attempts for failures).
- Balance checks and low-balance pauses.
- Circuit-breaker activations for RPC/network issues.

### Backend Logging (Node.js/Express or NestJS)

1. **Installation and Setup**:
   Install Winston and related transports:
   ```
   npm install winston winston-daily-rotate-file winston-elasticsearch
   ```

   Configure in `src/config/logger.ts`:
   ```typescript
   import * as winston from 'winston';

   const logger = winston.createLogger({
     level: process.env.LOG_LEVEL || 'info',
     format: winston.format.combine(
       winston.format.timestamp(),
       winston.format.errors({ stack: true }),
       winston.format.json()
     ),
     transports: [
       // Local file rotation for audit trail
       new winston.transports.DailyRotateFile({
         filename: 'logs/agent-%DATE%.log',
         datePattern: 'YYYY-MM-DD',
         zippedArchive: true,
         maxSize: '20m',
         maxFiles: '14d',
         auditLedger: true // Custom filter for transaction events
       }),
       // Elasticsearch for centralized search (integrate with AWS OpenSearch if on Fargate)
       new winston.transports.Elasticsearch({
         level: 'info',
         clientOpts: {
           node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
           auth: { username: process.env.ES_USER, password: process.env.ES_PASS }
         },
         indexPrefix: 'autopay-agent'
       }),
       // Console for development
       new winston.transports.Console({ format: winston.format.simple() })
     ]
   });

   // Custom transport for JSON ledger (transaction audit trail)
   const ledgerTransport = new winston.transports.File({
     filename: 'ledger/transactions.jsonl',
     format: winston.format.printf(({ level, message, timestamp }) => JSON.stringify({
       timestamp, level,
       correlationId: message.correlationId,
       event: message.event, // e.g., 'payment_success', '402_detected'
       details: message.details // e.g., { txHash: 'abc123', amount: 0.01, apiEndpoint: '/market-feed' }
     }))
   });
   logger.add(ledgerTransport);

   export default logger;
   ```

2. **Usage Examples**:
   - Detecting 402: `logger.info({ event: '402_detected', details: { endpoint: '/api/market-feed', instructions: x402Headers } }, { correlationId });`
   - Payment Execution: `logger.warn({ event: 'payment_failure', details: { txHash, error: 'Insufficient funds', retryCount: 2 } }, { correlationId });`
   - Balance Monitoring: `if (balance < threshold) logger.error({ event: 'low_balance', details: { current: balance, threshold, triggerTopUp: true } });`
   - Solana Confirmation: `logger.info({ event: 'tx_confirmed', details: { signature: tx.signature, blockTime } });`

   For resilience, logs include error classification (e.g., 'facilitator_rejection', 'rpc_timeout') to feed into retry logic.

### Frontend Logging (Next.js)

Use console-based logging with Sentry integration for error tracking. In `lib/logger.ts`:
```typescript
// Next.js middleware or API routes
import * as Sentry from '@sentry/nextjs';

export const logAgentEvent = (event: string, details: any, correlationId?: string) => {
  console.log(JSON.stringify({ event, details, correlationId, timestamp: new Date().toISOString() }));
  
  // Send to backend ledger via API for unified audit
  fetch('/api/log', { method: 'POST', body: JSON.stringify({ event, details, correlationId }) });
  
  if (event.includes('error')) Sentry.captureMessage(event, 'error', { extra: details });
};
```

Logs from UI (e.g., payment flow visualization) sync to the backend JSON ledger for end-to-end traceability.

### Blockchain-Specific Logging

- **Solana RPC Monitoring**: Use `@solana/web3.js` connection events to log RPC health: `connection.onLogs(hash, (logs) => logger.info({ event: 'solana_logs', details: logs }));`
- **Phantom Session Keys**: Log delegation: `logger.info({ event: 'session_delegated', details: { scope: 'sign_tx', duration: '1h', permissions: 'scoped' } });`
- **Coinbase Facilitator**: WebSocket callbacks log verification: `ws.onmessage = (msg) => logger.info({ event: 'facilitator_verify', details: JSON.parse(msg.data) });`

All Solana transaction hashes are appended to the JSON ledger (`transactions.jsonl`) with fields: `{ txHash, status, timestamp, amount, toAddress, apiContext: 'market-data' }`.

## Metrics Collection

Metrics focus on agent performance in x402 flows, using Prometheus for scraping and Grafana for dashboards. Key metrics:
- `http_402_detected_total`: Counter for 402 responses (labels: `api_type` = 'market' or 'knowledge').
- `payment_success_rate`: Gauge (0-1) for successful Phantom CASH/USDC txns.
- `retry_attempts_total`: Histogram for backoff durations (buckets: 1s, 2s, 4s).
- `wallet_balance`: Gauge for Devnet USDC/CASH levels.
- `rpc_latency_seconds`: Histogram for Solana RPC calls.
- `api_access_post_payment`: Counter for successful retries accessing premium data (e.g., crypto prices, AI insights).

### Setup

1. **Prometheus Exporter in Backend**:
   Install `prom-client`:
   ```
   npm install prom-client
   ```

   In `src/metrics.ts`:
   ```typescript
   import client from 'prom-client';
   const register = new client.Registry();
   client.collectDefaultMetrics({ register });

   // Custom metrics
   const http402Counter = new client.Counter({
     name: 'http_402_detected_total',
     help: 'Total 402 Payment Required detections',
     labelNames: ['api_type']
   });
   const balanceGauge = new client.Gauge({
     name: 'wallet_balance_usdc',
     help: 'Current wallet balance in USDC Devnet'
   });

   // Expose endpoint
   app.get('/metrics', async (req, res) => {
     res.set('Content-Type', register.contentType);
     res.end(await register.metrics());
   });

   // Update in agent logic
   export const update402Metric = (apiType: string) => http402Counter.inc({ api_type: apiType });
   export const updateBalance = (balance: number) => balanceGauge.set(balance);
   ```

2. **Frontend Metrics**: Use Vercel Analytics or custom Prometheus pushgateway for UI events (e.g., session delegation views).

3. **Solana Metrics**: Custom scraper for Devnet RPC: Poll `getBalance` every 30s and expose via `/solana-metrics`.

### Dashboards

- **Grafana Setup**: Deploy via Docker: `docker run -d -p 3000:3000 grafana/grafana`. Add Prometheus datasource.
- **Key Panels**:
  - Agent Uptime: `up{job="autopay-agent"}`.
  - Payment Flow: Heatmap of `payment_success_rate` over time, filtered by Phase (1: demo, 2: interactive, 3: multi-API).
  - Balance Trends: Line chart of `wallet_balance`, alerting if < 0.1 USDC.
  - Retry Analysis: Histogram showing exponential backoff efficacy for failures (e.g., 'facilitator_rejection').

For AWS Fargate deployment, integrate Amazon CloudWatch Container Insights for Docker metrics.

## Alerting and Notifications

Use Prometheus Alertmanager or PagerDuty for thresholds:
- **Low Balance**: If `wallet_balance < 0.05` for >5min, alert: "Autopay Agent paused - Top-up Phantom wallet (correlationId: {{ $labels.correlationId }})".
- **Payment Failure Rate**: If >20% failures in 1h, notify: "High retry rate on Solana txns - Check RPC (details in ledger)".
- **Circuit-Breaker**: On RPC timeout >10s, Slack/Email: "Network issue - Queued payments: {{ $value }}".
- **402 Spike**: If `http_402_detected_total > 10/min`, alert for API monetization insights (e.g., high demand on /market-feed).

Configuration in `alertmanager.yml`:
```yaml
global:
  slack_api_url: '{{ secrets.SLACK_WEBHOOK }}'

route:
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 1h
  receiver: 'slack-notifications'

receivers:
- name: 'slack-notifications'
  slack_configs:
  - channel: '#autopay-alerts'
    text: 'Autopay Agent Alert: {{ range .Alerts }}{{ .Annotations.summary }}\n{{ end }}'
```

Integrate with BackendDev deployments: Expose alerting endpoints in CI/CD (e.g., Render hooks) to notify on deploy failures.

## Tracing and Observability

For distributed tracing in x402 flows:
- **OpenTelemetry**: Instrument backend with `@opentelemetry/sdk-node`.
  - Traces: Span for "402_detection" → "phantom_sign" → "solana_confirm" → "api_retry".
  - Export to Jaeger (Docker: `docker run -d -p 16686:16686 jaegertracing/all-in-one`).
- **Security Logs**: Audit session keys and encryption (AES-256): Log "key_encrypted" events without exposing values.
- **Devnet Isolation**: All traces tagged with `env=devnet` to separate from future mainnet.

## Deployment Integration

- **Vercel (Frontend)**: Enable Vercel Speed Insights for UI metrics; log to backend via API routes.
- **Cloudflare Workers/Render (Backend)**: Use Workers KV for ephemeral logs; Render's log streams to integrate with ELK.
- **AWS Fargate/Docker**: Containerize with `Dockerfile` including logging sidecar:
  ```
  FROM node:18-alpine
  WORKDIR /app
  COPY . .
  RUN npm install
  CMD ["npm", "start"]
  EXPOSE 3000 9090  # App + Prometheus
  ```
  Use ECS task definitions with CloudWatch Logs for Fargate.

- **CI/CD Pipeline Snippet** (for BackendDev coordination):
  In `.github/workflows/deploy.yml`:
  ```yaml
  - name: Deploy Monitoring
    run: |
      docker build -t autopay-agent .
      # Push to ECR/AWS, enable CloudWatch
      aws ecs update-service --cluster autopay-cluster --service agent-service --force-new-deployment
  ```

## Best Practices and Maintenance

- **Retention**: Logs: 14 days (rotate); Metrics: 7 days hot storage.
- **Compliance**: All logs anonymize wallet addresses (hashing); GDPR-ready for AI insights data.
- **Testing**: Jest tests for logger: `expect(logOutput).toContain('txHash')`. Simulate failures with Postman for alerting.
- **Scalability**: For Phase 3 multi-API, shard logs by `api_type`. Monitor agent as independent entity: Track "economic throughput" (txns/hour vs. funds spent).
- **Unique ID Integration**: Embed `1762841338088_autopay_agent_for_x402_autonomous_payments_on_solana__infra_monitoring_md_1h5fm` in log metadata for traceability during hackathon audits.

This setup provides production-ready observability, enabling real-time insights into the agent's autonomous x402 economy operations while coordinating seamlessly with backend deployments.