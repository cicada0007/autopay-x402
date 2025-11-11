'use client';

import type { BalancePoint } from '@/stores/useAgentStore';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

interface BalanceHistoryChartProps {
  points: BalancePoint[];
  threshold: number;
}

export function BalanceHistoryChart({ points, threshold }: BalanceHistoryChartProps) {
  const data = points.slice(-40).map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString(),
    balance: Number(point.balance.toFixed(4)),
    status: point.status
  }));

  if (!data.length) {
    return <p className="text-sm text-slate-500">Balance history will appear after the first snapshot.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="time" hide />
        <YAxis domain={['dataMin - 0.05', 'dataMax + 0.05']} stroke="#64748b" />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#e2e8f0' }}
          formatter={(value: number) => [`${value.toFixed(4)} USDC`, 'Balance']}
        />
        <ReferenceLine y={threshold} stroke="#f97316" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="balance"
          stroke="#22d3ee"
          fillOpacity={1}
          fill="url(#balanceGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}


