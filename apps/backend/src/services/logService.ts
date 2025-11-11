import { prisma } from '@db/client';
import { readLedger } from '@utils/ledger';

export async function getRecentLedger(limit = 50) {
  const ledger = await readLedger();
  return ledger.slice(-limit).reverse();
}

export async function getRecentTransactions(limit = 20) {
  const transactions = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit
  });
  return transactions;
}

