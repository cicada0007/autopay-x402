import http from 'http';

import { initializeSecrets } from './config/secretsManager';

async function bootstrap() {
  await initializeSecrets();

  const appModule = await import('./app');
  const { env } = await import('./config/env');
  const balanceService = await import('./services/balanceService');
  const schedulerService = await import('./services/schedulerService');

  const server = http.createServer(appModule.default);

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Autopay Agent backend running on port ${env.PORT}`);
    balanceService.startBalanceMonitor().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[backend] failed to start balance monitor', error);
    });
    schedulerService.startScheduler().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[backend] failed to start scheduler', error);
    });
  });

  const gracefulShutdown = () => {
    // eslint-disable-next-line no-console
    console.log('Shutting down backend gracefully...');
    balanceService.stopBalanceMonitor();
    schedulerService.stopScheduler();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[backend] failed to bootstrap application', error);
  process.exit(1);
});

