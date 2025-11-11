import http from 'http';

import app from './app';
import { env } from './config/env';

const server = http.createServer(app);

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Autopay Agent backend running on port ${env.PORT}`);
});

const gracefulShutdown = () => {
  // eslint-disable-next-line no-console
  console.log('Shutting down backend gracefully...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

