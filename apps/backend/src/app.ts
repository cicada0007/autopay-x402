import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from '@config/env';
import { errorHandler } from '@middleware/errorHandler';
import agentRoutes from '@routes/agentRoutes';
import healthRoutes from '@routes/healthRoutes';
import logRoutes from '@routes/logRoutes';
import paymentRoutes from '@routes/paymentRoutes';

const app = express();

app.use(
  cors({
    origin: ['http://localhost:3000', process.env.NEXT_PUBLIC_FRONTEND_ORIGIN].filter(Boolean),
    credentials: true
  })
);
app.use(helmet());
app.use(express.json());
app.use(
  pinoHttp({
    level: env.NODE_ENV === 'development' ? 'debug' : 'info'
  })
);

app.use('/health', healthRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/logs', logRoutes);

app.use(errorHandler);

export default app;

