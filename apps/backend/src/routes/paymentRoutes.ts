import { Router } from 'express';

import { balanceHandler, executePaymentHandler } from '@controllers/paymentController';

const router = Router();

router.post('/execute', executePaymentHandler);
router.get('/balance', balanceHandler);

export default router;

