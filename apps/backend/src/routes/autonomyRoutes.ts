import { Router } from 'express';

import { queueStatusHandler } from '@controllers/autonomyController';

const router = Router();

router.get('/queue', queueStatusHandler);

export default router;


