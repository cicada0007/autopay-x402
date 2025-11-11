import express, { Router } from 'express';

import {
  balanceHandler,
  executePaymentHandler,
  facilitatorCallbackHandler
} from '@controllers/paymentController';

const router = Router();

router.post('/execute', executePaymentHandler);
router.get('/balance', balanceHandler);
router.post('/facilitator/callback', express.raw({ type: '*/*' }), facilitatorCallbackHandler);

export default router;

