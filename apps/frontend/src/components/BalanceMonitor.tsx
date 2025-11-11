'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';

interface BalanceMonitorProps {
  balance: number;
  threshold: number;
}

export function BalanceMonitor({ balance, threshold }: BalanceMonitorProps) {
  const low = balance < threshold;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="rounded-full bg-slate-800 p-3">
        {low ? <TrendingDown className="h-6 w-6 text-red-400" /> : <TrendingUp className="h-6 w-6 text-emerald-400" />}
      </div>
      <div>
        <p className="text-sm text-slate-400">Simulated Balance</p>
        <p className="text-xl font-semibold text-slate-100">{balance.toFixed(3)} USDC</p>
        <p className="text-xs text-slate-500">
          Threshold: {threshold} USDC {low && '— payments paused until top-up'}
        </p>
      </div>
    </div>
  );
}

