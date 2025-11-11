import { Clock, PauseCircle, PlayCircle, RefreshCcw } from 'lucide-react';

import type { QueueTaskSummary } from '@/stores/useAgentStore';

interface QueueStatusProps {
  tasks: QueueTaskSummary[];
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString();
}

function statusIcon(status: string) {
  switch (status) {
    case 'RUNNING':
      return <RefreshCcw className="h-4 w-4 text-emerald-400" />;
    case 'BACKOFF':
      return <PauseCircle className="h-4 w-4 text-amber-400" />;
    default:
      return <PlayCircle className="h-4 w-4 text-slate-400" />;
  }
}

export function QueueStatus({ tasks }: QueueStatusProps) {
  if (!tasks.length) {
    return <p className="text-sm text-slate-500">Scheduler queue is initializing…</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="bg-slate-900/80 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Endpoint</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Failures</th>
            <th className="px-4 py-3">Next Run</th>
            <th className="px-4 py-3">Last Success</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-t border-slate-800/60">
              <td className="px-4 py-3 font-medium text-slate-200">{task.endpoint}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {statusIcon(task.status)}
                  <span>{task.status.toLowerCase()}</span>
                  {task.lastError && (
                    <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-xs text-red-300">
                      {task.lastError}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">{task.score.toFixed(2)}</td>
              <td className="px-4 py-3">{task.failureCount}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(task.nextRunAt)}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-400">{formatTimestamp(task.lastSuccessAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


