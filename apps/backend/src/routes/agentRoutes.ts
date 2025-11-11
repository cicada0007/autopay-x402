import { Router } from 'express';

import {
  requestFailureHandler,
  requestPremiumHandler,
  requestStatusHandler
} from '@controllers/agentController';

const router = Router();

router.post('/request', requestPremiumHandler);
router.get('/status/:requestId', requestStatusHandler);
router.post('/fail', requestFailureHandler);

export default router;

