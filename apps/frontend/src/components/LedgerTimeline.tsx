'use client';

import type { LedgerEntry } from '@/stores/useAgentStore';

interface LedgerTimelineProps {
  entries: LedgerEntry[];
}

export function LedgerTimeline({ entries }: LedgerTimelineProps) {
  if (!entries.length) {
    return <p className="text-sm text-slate-400">Ledger empty. Trigger a request to populate events.</p>;
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry) => (
        <li key={`${entry.timestamp}-${entry.event}`} className="relative border-l border-slate-800 pl-4">
          <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-solana-500" />
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {new Date(entry.timestamp).toLocaleTimeString()} — {entry.category}
          </p>
          <p className="text-sm font-medium text-slate-100">{entry.event}</p>
          {entry.txHash && (
            <p className="text-xs text-slate-500 break-all">
              txHash: {entry.txHash.slice(0, 16)}…{entry.txHash.slice(-4)}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

