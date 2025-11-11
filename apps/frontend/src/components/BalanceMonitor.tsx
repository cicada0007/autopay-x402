'use client';

import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

interface BalanceMonitorProps {
  balance: number;
  threshold: number;
  status: 'OK' | 'LOW' | 'ERROR' | 'UNKNOWN';
  paused: boolean;
  pauseReason?: string | null;
  lastUpdated?: string | null;
}

export function BalanceMonitor({ balance, threshold, status, paused, pauseReason, lastUpdated }: BalanceMonitorProps) {
  const isLow = status === 'LOW' || balance < threshold;
  const isError = status === 'ERROR';
  const Icon = isError ? AlertTriangle : isLow || paused ? TrendingDown : TrendingUp;
  const iconClass = isError
    ? 'text-amber-400'
    : isLow || paused
      ? 'text-red-400'
      : 'text-emerald-400';
  const containerClass = paused || isLow || isError ? 'border-red-700/60 bg-red-950/40' : 'border-slate-800 bg-slate-900/60';
  const lastUpdatedDate = lastUpdated ? new Date(lastUpdated) : null;
  const formattedUpdated =
    lastUpdatedDate && !Number.isNaN(lastUpdatedDate.getTime()) ? lastUpdatedDate.toLocaleTimeString() : null;

  return (
    <div className={`flex items-start gap-3 rounded-xl border ${containerClass} p-4`}>
      <div className="rounded-full bg-slate-800/80 p-3">
        <Icon className={`h-6 w-6 ${iconClass}`} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-400">Payment Wallet Balance</p>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase text-slate-400">
            {status.toLowerCase()}
          </span>
        </div>
        <p className="text-xl font-semibold text-slate-100">{balance.toFixed(3)} USDC</p>
        <p className="text-xs text-slate-500">
          Threshold: {threshold.toFixed(3)} USDC
          {paused
            ? pauseReason
              ? ` — payments paused (${pauseReason})`
              : ' — payments paused'
            : isLow
              ? ' — approaching threshold'
              : ''}
        </p>
        {formattedUpdated && (
          <p className="text-xs text-slate-500">Last updated {formattedUpdated}</p>
        )}
      </div>
    </div>
  );
}

