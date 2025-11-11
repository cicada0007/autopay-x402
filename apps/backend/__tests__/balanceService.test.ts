import { prisma } from '@db/client';
import {
  ensurePaymentsActive,
  getBalanceSummary,
  ingestBalanceReading
} from '@services/balanceService';

describe('balanceService', () => {
  beforeEach(async () => {
    await prisma.balanceSnapshot.deleteMany();
    await prisma.systemState.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('records balance snapshots and keeps payments active above threshold', async () => {
    await ingestBalanceReading(0.5, 'test');

    const summary = await getBalanceSummary();

    expect(summary.balance).toBeCloseTo(0.5);
    expect(summary.paused).toBe(false);
    await expect(ensurePaymentsActive()).resolves.toBeUndefined();
  });

  it('pauses payments when balance drops below threshold', async () => {
    await ingestBalanceReading(0.01, 'test-low');

    const summary = await getBalanceSummary();
    expect(summary.paused).toBe(true);
    expect(summary.pauseReason).toBe('LOW_BALANCE');
    await expect(ensurePaymentsActive()).rejects.toThrow('Payments temporarily paused');
  });

  it('resumes payments once balance recovers above threshold', async () => {
    await ingestBalanceReading(0.01, 'test-low');
    await ingestBalanceReading(0.2, 'test-recover');

    const summary = await getBalanceSummary();
    expect(summary.paused).toBe(false);
    expect(summary.pauseReason).toBeNull();
    await expect(ensurePaymentsActive()).resolves.toBeUndefined();
  });
});


