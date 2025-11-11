import { prisma } from '@db/client';
import { appendLedgerEntry, fetchLedger } from '@utils/ledger';

describe('ledger utils', () => {
  beforeEach(async () => {
    await prisma.ledgerEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists ledger entries in the database', async () => {
    const timestamp = new Date('2024-01-01T00:00:00Z').toISOString();
    await appendLedgerEntry({
      timestamp,
      category: 'TEST',
      event: 'created',
      metadata: { foo: 'bar' }
    });

    const result = await fetchLedger({ limit: 10 });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      timestamp,
      category: 'TEST',
      event: 'created'
    });
    expect(result.entries[0].metadata).toEqual({ foo: 'bar' });
  });

  it('supports pagination and filtering', async () => {
    for (let i = 0; i < 5; i += 1) {
      await appendLedgerEntry({
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        category: i % 2 === 0 ? 'PAYMENT' : 'SYSTEM',
        event: `event-${i}`,
        requestId: `request-${i}`
      });
    }

    const firstPage = await fetchLedger({ limit: 3 });
    expect(firstPage.entries).toHaveLength(3);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await fetchLedger({ limit: 3, cursor: firstPage.nextCursor ?? undefined });
    expect(secondPage.entries.length).toBeGreaterThan(0);
    const allIds = new Set([...firstPage.entries, ...secondPage.entries].map((entry) => entry.requestId));
    expect(allIds.size).toBeGreaterThan(3);

    const filtered = await fetchLedger({ limit: 10, category: 'PAYMENT' });
    expect(filtered.entries.length).toBeGreaterThan(0);
    expect(filtered.entries.every((entry) => entry.category === 'PAYMENT')).toBe(true);
  });
});


