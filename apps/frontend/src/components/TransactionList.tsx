'use client';

import type { TransactionEntry } from '@/stores/useAgentStore';

interface TransactionListProps {
  transactions: TransactionEntry[];
}

export function TransactionList({ transactions }: TransactionListProps) {
  if (transactions.length === 0) {
    return <p className="text-sm text-slate-400">No payments executed yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {transactions.map((tx) => (
        <li key={tx.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-100">{tx.status.toUpperCase()}</span>
            <span className="text-xs text-slate-500">{new Date(tx.createdAt).toLocaleTimeString()}</span>
          </div>
          <p className="mt-1 text-slate-300">
            {Number(tx.amount).toFixed(3)} {tx.currency}
          </p>
          <p className="mt-1 break-all text-xs text-slate-500">txHash: {tx.txHash}</p>
        </li>
      ))}
    </ul>
  );
}

