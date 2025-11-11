import { Router } from 'express';

import { ledgerHandler, transactionsHandler } from '@controllers/logController';

const router = Router();

router.get('/ledger', ledgerHandler);
router.get('/transactions', transactionsHandler);

export default router;

