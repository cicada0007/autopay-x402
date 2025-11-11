import type { Prisma } from '@prisma/client';

import { prisma } from '@db/client';
import { emitEvent } from '@events/eventBus';

export interface LedgerEntry {
  timestamp: string;
  category: string;
  event: string;
  requestId?: string;
  paymentId?: string;
  txHash?: string;
  metadata?: Record<string, unknown> | null;
}

export interface LedgerQueryOptions {
  limit?: number;
  cursor?: string;
  category?: string;
  event?: string;
  requestId?: string;
  paymentId?: string;
  txHash?: string;
  from?: Date;
  to?: Date;
}

export interface LedgerQueryResult {
  entries: LedgerEntry[];
  nextCursor: string | null;
}

function mapLedgerRecord(record: Awaited<ReturnType<typeof prisma.ledgerEvent.findFirst>>) {
  if (!record) {
    return null;
  }

  let metadata: Record<string, unknown> | null = null;
  if (record.metadata) {
    try {
      metadata = JSON.parse(record.metadata) as Record<string, unknown>;
    } catch (_error) {
      metadata = null;
    }
  }

  return {
    timestamp: record.timestamp.toISOString(),
    category: record.category,
    event: record.event,
    requestId: record.requestId ?? undefined,
    paymentId: record.paymentId ?? undefined,
    txHash: record.txHash ?? undefined,
    metadata: metadata ?? undefined
  };
}

export async function appendLedgerEntry(entry: LedgerEntry): Promise<void> {
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();

  const created = await prisma.ledgerEvent.create({
    data: {
      timestamp,
      category: entry.category,
      event: entry.event,
      requestId: entry.requestId ?? null,
      paymentId: entry.paymentId ?? null,
      txHash: entry.txHash ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null
    }
  });

  emitEvent({
    type: 'ledger-entry',
    payload: mapLedgerRecord(created)
  });
}

export async function fetchLedger(options: LedgerQueryOptions = {}): Promise<LedgerQueryResult> {
  const take = Math.min(Math.max(options.limit ?? 50, 1), 500);

  const where: Prisma.LedgerEventWhereInput = {};

  if (options.category) {
    where.category = options.category;
  }
  if (options.event) {
    where.event = options.event;
  }
  if (options.requestId) {
    where.requestId = options.requestId;
  }
  if (options.paymentId) {
    where.paymentId = options.paymentId;
  }
  if (options.txHash) {
    where.txHash = options.txHash;
  }
  if (options.from || options.to) {
    where.timestamp = {};
    if (options.from) {
      where.timestamp.gte = options.from;
    }
    if (options.to) {
      where.timestamp.lte = options.to;
    }
  }

  const queryOptions: Prisma.LedgerEventFindManyArgs = {
    where,
    orderBy: { timestamp: 'desc' },
    take: take + 1
  };

  if (options.cursor) {
    queryOptions.skip = 1;
    queryOptions.cursor = { id: options.cursor };
  }

  const records = await prisma.ledgerEvent.findMany(queryOptions);
  const hasMore = records.length > take;
  const entries = records.slice(0, take).map((record) => mapLedgerRecord(record)!) as LedgerEntry[];
  const nextCursor = hasMore ? records[records.length - 1].id : null;

  return {
    entries,
    nextCursor
  };
}

export async function readLedger(options?: LedgerQueryOptions): Promise<LedgerEntry[]> {
  const result = await fetchLedger(options);
  return result.entries;
}

