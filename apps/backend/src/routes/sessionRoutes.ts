import { Router } from 'express';

import {
  getActiveSessionHandler,
  getSessionHandler,
  incrementSessionUsageHandler,
  issueSessionHandler,
  refreshSessionHandler,
  revokeSessionHandler
} from '@controllers/sessionController';

const router = Router();

router.post('/issue', issueSessionHandler);
router.get('/:sessionId', getSessionHandler);
router.get('/:sessionId/active', getActiveSessionHandler);
router.post('/:sessionId/refresh', refreshSessionHandler);
router.post('/:sessionId/revoke', revokeSessionHandler);
router.post('/:sessionId/increment', incrementSessionUsageHandler);

export default router;

