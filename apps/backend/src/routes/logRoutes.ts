import { Router } from 'express';

import { ledgerCsvHandler, ledgerHandler, transactionsHandler } from '@controllers/logController';

const router = Router();

router.get('/ledger', ledgerHandler);
router.get('/ledger/export', ledgerCsvHandler);
router.get('/transactions', transactionsHandler);

export default router;

