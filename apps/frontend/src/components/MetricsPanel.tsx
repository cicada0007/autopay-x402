'use client';

import type {
  LedgerEntry,
  QueueTaskSummary,
  TransactionEntry
} from '@/stores/useAgentStore';

interface MetricsPanelProps {
  queue: QueueTaskSummary[];
  transactions: TransactionEntry[];
  ledger: LedgerEntry[];
}

function getPaymentStats(transactions: TransactionEntry[]) {
  return transactions.reduce(
    (acc, tx) => {
      const status = tx.status.toUpperCase();
      if (status === 'CONFIRMED') acc.confirmed += 1;
      else if (status === 'FAILED' || status === 'REJECTED') acc.failed += 1;
      else acc.pending += 1;
      return acc;
    },
    { confirmed: 0, failed: 0, pending: 0 }
  );
}

export function MetricsPanel({ queue, transactions, ledger }: MetricsPanelProps) {
  const queueDepth = queue.length;
  const running = queue.filter((task) => task.status === 'RUNNING').length;
  const backoff = queue.filter((task) => task.status === 'BACKOFF').length;
  const stats = getPaymentStats(transactions);
  const facilitatorEvents = ledger
    .filter((entry) => entry.category === 'PAYMENT' && entry.event.startsWith('facilitator-'))
    .slice(0, 5);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Queue Depth</p>
        <p className="mt-2 text-2xl font-semibold text-slate-100">{queueDepth}</p>
        <p className="mt-1 text-xs text-slate-500">
          {running} running · {backoff} backing off
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Payments</p>
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-emerald-400">Confirmed: {stats.confirmed}</p>
          <p className="text-amber-400">Pending: {stats.pending}</p>
          <p className="text-red-400">Rejected: {stats.failed}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Facilitator Results</p>
        {facilitatorEvents.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Awaiting facilitator callbacks…</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            {facilitatorEvents.map((entry) => (
              <li key={`${entry.timestamp}-${entry.event}`}>
                {new Date(entry.timestamp).toLocaleTimeString()} —{' '}
                {entry.metadata?.status ?? entry.event}
                {entry.metadata?.reason ? ` (${entry.metadata.reason})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


