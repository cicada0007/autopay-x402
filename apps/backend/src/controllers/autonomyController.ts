import type { Request, Response } from 'express';

import { asyncHandler } from '@middleware/asyncHandler';
import { getQueueStatus } from '@services/schedulerService';

export const queueStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  const tasks = await getQueueStatus();
  res.json({
    tasks
  });
});


