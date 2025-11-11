import { prisma } from '@db/client';
import { createOrGetRequest } from '@services/agentService';

describe('agentService', () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.agentRequest.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a new premium request and returns payment instructions', async () => {
    const result = await createOrGetRequest('market');

    expect(result.outcome).toBe('PAYMENT_REQUIRED');
    expect(result.instructions?.amount).toBeGreaterThan(0);
  });

  it('returns fulfilled data after marking request as paid', async () => {
    const initial = await createOrGetRequest('market');
    expect(initial.outcome).toBe('PAYMENT_REQUIRED');

    await prisma.agentRequest.update({
      where: { id: initial.requestId },
      data: { status: 'PAID' }
    });

    const fulfilled = await createOrGetRequest('market', initial.requestId);

    expect(fulfilled.outcome).toBe('FULFILLED');
    expect(fulfilled.data).toHaveProperty('prices');
  });
});

