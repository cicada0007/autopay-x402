import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from '@config/env';
import { errorHandler } from '@middleware/errorHandler';
import { enforceHttps } from '@middleware/enforceHttps';
import { adminAuth } from '@middleware/adminAuth';
import agentRoutes from '@routes/agentRoutes';
import healthRoutes from '@routes/healthRoutes';
import logRoutes from '@routes/logRoutes';
import paymentRoutes from '@routes/paymentRoutes';
import sessionRoutes from '@routes/sessionRoutes';
import autonomyRoutes from '@routes/autonomyRoutes';
import eventRoutes from '@routes/eventRoutes';

const app = express();

app.set('trust proxy', 1);

const allowedOrigins = env.ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by CORS'));
      }
    },
    credentials: true,
    optionsSuccessStatus: 204
  })
);
app.use(helmet());
app.use(express.json());
app.use(
  pinoHttp({
    level: env.NODE_ENV === 'development' ? 'debug' : 'info'
  })
);
app.use(enforceHttps);

app.use('/health', healthRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/logs', adminAuth, logRoutes);
app.use('/api/sessions', adminAuth, sessionRoutes);
app.use('/api/autonomy', adminAuth, autonomyRoutes);
app.use('/api/events', adminAuth, eventRoutes);

app.use(errorHandler);

export default app;

