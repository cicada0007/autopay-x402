import { addSeconds, subSeconds } from 'date-fns';

import { prisma } from '@db/client';
import {
  calculateBackoffSeconds,
  computeTaskScore,
  getQueueStatus,
  __internals
} from '@services/schedulerService';

describe('schedulerService', () => {
  beforeEach(async () => {
    await prisma.autonomyTask.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ensures tasks are seeded and score grows with staleness', async () => {
    await __internals.ensureTasks();

    const [task] = await prisma.autonomyTask.findMany({ take: 1 });
    expect(task).toBeDefined();

    const now = new Date();
    const freshScore = computeTaskScore({
      ...task,
      lastSuccessAt: now
    });

    const staleScore = computeTaskScore({
      ...task,
      lastSuccessAt: subSeconds(now, task.freshnessSeconds * 4)
    });

    expect(staleScore).toBeGreaterThan(freshScore);
  });

  it('calculates exponential backoff with a capped ceiling', () => {
    expect(calculateBackoffSeconds(30, 1)).toBe(30);
    expect(calculateBackoffSeconds(30, 2)).toBe(60);
    expect(calculateBackoffSeconds(30, 3)).toBe(120);
    expect(calculateBackoffSeconds(30, 6)).toBeLessThanOrEqual(900);
  });

  it('returns queue status with computed scores', async () => {
    await __internals.ensureTasks();

    const [task] = await prisma.autonomyTask.findMany({ take: 1 });
    await prisma.autonomyTask.update({
      where: { id: task.id },
      data: {
        lastSuccessAt: subSeconds(new Date(), 600),
        nextRunAt: addSeconds(new Date(), 30),
        failureCount: 2,
        lastError: 'sample-error'
      }
    });

    const status = await getQueueStatus();
    expect(status.length).toBeGreaterThan(0);
    const entry = status.find((item) => item.id === task.id);
    expect(entry).toBeDefined();
    expect(entry?.score).toBeGreaterThan(0);
    expect(entry?.lastError).toBe('sample-error');
  });
});


