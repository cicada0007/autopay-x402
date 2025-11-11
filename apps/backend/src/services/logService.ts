import { prisma } from '@db/client';
import {
  fetchLedger,
  type LedgerEntry,
  type LedgerQueryOptions,
  type LedgerQueryResult
} from '@utils/ledger';

export async function getRecentLedger(limit = 50) {
  const result = await fetchLedger({ limit });
  return result.entries;
}

export async function queryLedger(options: LedgerQueryOptions): Promise<LedgerQueryResult> {
  return fetchLedger(options);
}

export async function exportLedger(options: LedgerQueryOptions): Promise<LedgerEntry[]> {
  const cappedLimit = Math.min(Math.max(options.limit ?? 1000, 1), 5000);
  const result = await fetchLedger({ ...options, limit: cappedLimit, cursor: undefined });
  return result.entries;
}

export async function getRecentTransactions(limit = 20) {
  const transactions = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit
  });
  return transactions;
}

