import { Router } from 'express';

import { eventStreamHandler } from '@controllers/eventController';

const router = Router();

router.get('/stream', eventStreamHandler);

export default router;


