'use client';

import { useEffect } from 'react';
import { isAxiosError } from 'axios';

import { toast, Toaster } from 'react-hot-toast';

import { AutonomySelector } from '@/components/AutonomySelector';
import { BalanceMonitor } from '@/components/BalanceMonitor';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LedgerTimeline } from '@/components/LedgerTimeline';
import { PaymentFlowVisualizer } from '@/components/PaymentFlowVisualizer';
import { TransactionList } from '@/components/TransactionList';
import { WalletConnectButton } from '@/components/WalletConnectButton';
import { executePayment, requestPremiumData } from '@/lib/api';
import {
  useAgentStore,
  type LedgerEntry,
  type TransactionEntry,
  type QueueTaskSummary,
  type BalancePoint
} from '@/stores/useAgentStore';
import { QueueStatus } from '@/components/QueueStatus';
import { MetricsPanel } from '@/components/MetricsPanel';
import { BalanceHistoryChart } from '@/components/visualizations/BalanceHistoryChart';

export default function DashboardPage() {
  const {
    autonomyPhase,
    request,
    setRequest,
    setBalanceState,
    balance,
    balanceStatus,
    balanceThreshold,
    paymentsPaused,
    pauseReason,
    balanceUpdatedAt,
    ledger,
    setLedger,
    transactions,
    setTransactions,
    queue,
    setQueue,
    balanceHistory,
    setBalanceHistory
  } = useAgentStore();

  useEffect(() => {
    const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN;
    const streamUrl = adminToken ? `/api/events/stream?token=${encodeURIComponent(adminToken)}` : '/api/events/stream';
    const source = new EventSource(streamUrl);

    const parseLedgerEntry = (entry: Record<string, unknown>): LedgerEntry => ({
      timestamp: String(entry.timestamp ?? new Date().toISOString()),
      category: String(entry.category ?? 'SYSTEM'),
      event: String(entry.event ?? 'unknown'),
      requestId: entry.requestId ? String(entry.requestId) : undefined,
      paymentId: entry.paymentId ? String(entry.paymentId) : undefined,
      txHash: entry.txHash ? String(entry.txHash) : undefined,
      metadata: (entry.metadata as Record<string, unknown> | undefined) ?? undefined
    });

    const parseTransaction = (tx: Record<string, unknown>): TransactionEntry => ({
      id: String(tx.id ?? ''),
      requestId: String(tx.requestId ?? ''),
      txHash: String(tx.txHash ?? ''),
      currency: String(tx.currency ?? 'USDC'),
      amount: String(tx.amount ?? '0'),
      status: String(tx.status ?? 'PENDING'),
      confirmedAt: tx.confirmedAt ? String(tx.confirmedAt) : null,
      createdAt: String(tx.createdAt ?? new Date().toISOString())
    });

    const parseBalancePoint = (point: Record<string, unknown>): BalancePoint => ({
      timestamp: String(point.recordedAt ?? point.timestamp ?? new Date().toISOString()),
      balance: Number(point.balance ?? 0),
      status: (point.status ?? 'UNKNOWN') as BalancePoint['status']
    });

    const parseQueue = (tasks: Array<Record<string, unknown>>): QueueTaskSummary[] =>
      tasks.map((task) => ({
        id: String(task.id ?? ''),
        endpoint: String(task.endpoint ?? ''),
        status: String(task.status ?? 'IDLE'),
        score: typeof task.score === 'number' ? task.score : Number(task.score ?? 0),
        lastScore:
          typeof task.lastScore === 'number'
            ? task.lastScore
            : task.lastScore != null
              ? Number(task.lastScore)
              : null,
        lastRunAt: task.lastRunAt ? String(task.lastRunAt) : null,
        lastSuccessAt: task.lastSuccessAt ? String(task.lastSuccessAt) : null,
        failureCount: typeof task.failureCount === 'number' ? task.failureCount : Number(task.failureCount ?? 0),
        nextRunAt: task.nextRunAt ? String(task.nextRunAt) : null,
        lastError: task.lastError ? String(task.lastError) : null
      }));

    source.addEventListener('bootstrap', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data ?? '{}') as Record<string, unknown>;

        const balancePayload = data.balance as Record<string, unknown> | undefined;
        if (balancePayload) {
          setBalanceState({
            balance: Number(balancePayload.balance ?? 0),
            status: (balancePayload.status ?? 'UNKNOWN') as BalancePoint['status'],
            threshold: Number(balancePayload.threshold ?? 0),
            paused: Boolean(balancePayload.paused),
            pauseReason: (balancePayload.pauseReason as string | null | undefined) ?? null,
            lastUpdated: balancePayload.lastUpdated ? String(balancePayload.lastUpdated) : null
          });
        }

        const ledgerEntries = Array.isArray(data.ledger)
          ? (data.ledger as Array<Record<string, unknown>>)
              .map(parseLedgerEntry)
              .reverse()
          : [];
        if (ledgerEntries.length) {
          setLedger(ledgerEntries);
        }

        const payments = Array.isArray(data.payments)
          ? (data.payments as Array<Record<string, unknown>>).map((tx) =>
              parseTransaction({
                ...tx,
                amount: tx.amount != null ? String(tx.amount) : '0'
              })
            )
          : [];
        if (payments.length) {
          setTransactions(payments);
        }

        const tasks = Array.isArray(data.queue)
          ? parseQueue(data.queue as Array<Record<string, unknown>>)
          : [];
        if (tasks.length) {
          setQueue(tasks);
        }

        const history = Array.isArray(data.balanceHistory)
          ? (data.balanceHistory as Array<Record<string, unknown>>).map(parseBalancePoint)
          : [];
        if (history.length) {
          setBalanceHistory(history);
        }
      } catch (error) {
        console.error('Failed to process bootstrap event', error);
      }
    });

    source.addEventListener('ledger-entry', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data ?? '{}') as Record<string, unknown>;
        const entry = parseLedgerEntry(data);
        setLedger((current) => [entry, ...current].slice(0, 120));
      } catch (error) {
        console.error('Failed to process ledger event', error);
      }
    });

    source.addEventListener('balance-snapshot', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data ?? '{}') as Record<string, unknown>;
        const point = parseBalancePoint(data);
        const current = useAgentStore.getState();
        setBalanceState({
          balance: point.balance,
          status: point.status,
          threshold: data.threshold != null ? Number(data.threshold) : current.balanceThreshold,
          paused: data.paused != null ? Boolean(data.paused) : current.paymentsPaused,
          pauseReason:
            data.pauseReason !== undefined
              ? ((data.pauseReason as string | null | undefined) ?? null)
              : current.pauseReason,
          lastUpdated: point.timestamp
        });
        setBalanceHistory((history) => [...history.slice(-99), point]);
      } catch (error) {
        console.error('Failed to process balance event', error);
      }
    });

    source.addEventListener('queue-update', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data ?? '{}') as { tasks?: Array<Record<string, unknown>> };
        if (Array.isArray(data.tasks)) {
          setQueue(parseQueue(data.tasks));
        }
      } catch (error) {
        console.error('Failed to process queue event', error);
      }
    });

    source.addEventListener('payment-status', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data ?? '{}') as Record<string, unknown>;
        const transaction = parseTransaction({
          id: data.paymentId,
          requestId: data.requestId,
          txHash: data.txHash,
          currency: data.currency ?? 'USDC',
          amount: data.amount != null ? String(data.amount) : '0',
          status: data.status ?? 'PENDING',
          confirmedAt: data.status === 'CONFIRMED' ? new Date().toISOString() : null,
          createdAt: new Date().toISOString()
        });

        setTransactions((current) => {
          const existingIndex = current.findIndex((item) => item.id === transaction.id);
          if (existingIndex >= 0) {
            const updated = [...current];
            updated[existingIndex] = { ...updated[existingIndex], ...transaction };
            return updated;
          }
          return [transaction, ...current].slice(0, 50);
        });
      } catch (error) {
        console.error('Failed to process payment event', error);
      }
    });

    source.onerror = (error) => {
      console.error('Event stream error', error);
    };

    return () => {
      source.close();
    };
  }, [setBalanceState, setLedger, setTransactions, setQueue, setBalanceHistory]);

  const handleRequest = async (endpoint: 'market' | 'knowledge') => {
    setRequest({ endpoint, status: 'idle' });

    try {
      const outcome = await requestPremiumData(endpoint, request?.requestId);

      if (outcome.status === 'fulfilled') {
        setRequest({
          endpoint,
          status: 'fulfilled',
          requestId: outcome.data.requestId,
          data: outcome.data.data
        });
        toast.success('Premium data unlocked');
      } else {
        setRequest({
          endpoint,
          status: 'payment-required',
          requestId: outcome.instructions.requestId,
          instructions: outcome.instructions
        });
        toast('Payment required', { icon: '💳' });

        if (autonomyPhase === 3) {
          if (paymentsPaused) {
            toast.error(
              pauseReason ? `Payments paused: ${pauseReason}` : 'Payments paused due to low balance'
            );
          } else {
            await handlePayment(outcome.instructions.requestId);
          }
        }
      }
    } catch (error) {
      console.error(error);
      setRequest({
        endpoint,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unexpected error'
      });
      toast.error('Unable to process request');
    }
  };

  const handlePayment = async (requestId: string | undefined) => {
    if (!requestId) return;
    if (paymentsPaused) {
      toast.error(
        pauseReason ? `Payments paused: ${pauseReason}` : 'Payments paused due to low balance'
      );
      return;
    }

    setRequest((current) =>
      current
        ? {
            ...current,
            requestId,
            status: 'paying'
          }
        : null
    );

    try {
      const result = await executePayment(requestId);
      if (result.txHash) {
        toast.success('Payment confirmed on Devnet');
      } else {
        toast('Payment queued', { icon: '⏳' });
      }

      const fulfilled = await requestPremiumData(request?.endpoint ?? 'market', requestId);
      if (fulfilled.status === 'fulfilled') {
        setRequest({
          endpoint: request?.endpoint ?? 'market',
          status: 'fulfilled',
          requestId: fulfilled.data.requestId,
          txHash: result.txHash,
          data: fulfilled.data.data
        });
      }
    } catch (error) {
      console.error(error);
      if (isAxiosError(error) && error.response?.status === 503) {
        const responseBody = error.response.data as { message?: string; details?: { pauseReason?: string } } | undefined;
        const reason = responseBody?.details?.pauseReason;
        const message = responseBody?.message ?? 'Payments paused';
        toast.error(reason ? `${message}: ${reason}` : message);
        setRequest((current) =>
          current
            ? {
                ...current,
                status: 'error',
                error: reason ?? message
              }
            : null
        );
      } else {
        toast.error('Payment failed');
        setRequest((current) =>
          current
            ? {
                ...current,
                status: 'error',
                error: error instanceof Error ? error.message : 'Payment failed'
              }
            : null
        );
      }
    }
  };

  return (
    <>
      <Toaster position="bottom-right" />
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Autopay Agent</p>
            <h1 className="text-3xl font-semibold text-slate-50">x402 Autonomous Payment Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Observe the end-to-end Solana Devnet flow for premium API access. Trigger requests, execute payments, and
              monitor logs without leaving this console.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3">
            <AutonomySelector />
            <WalletConnectButton />
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-[2fr,1fr]">
          <Card
            title="Payment Flow"
            description="The agent detects 402 responses, pays on Devnet, and retries for premium data."
            actions={
              <div className="flex gap-2">
                <Button onClick={() => handleRequest('market')}>Request Market Data</Button>
                <Button variant="secondary" onClick={() => handleRequest('knowledge')}>
                  Request Knowledge Insights
                </Button>
                {request?.status === 'payment-required' && (
                  <Button
                    variant="success"
                    onClick={() => handlePayment(request.requestId)}
                    disabled={request.status !== 'payment-required' || paymentsPaused}
                  >
                    Execute Payment
                  </Button>
                )}
              </div>
              {paymentsPaused && (
                <p className="text-xs text-red-400">
                  Payments paused{pauseReason ? `: ${pauseReason}` : ' due to low balance'}
                </p>
              )}
            }
          >
            <PaymentFlowVisualizer state={request} />
          </Card>

          <div className="space-y-6">
            <Card title="Wallet Health" description="Solana Devnet wallet status">
              <BalanceMonitor
                balance={balance}
                threshold={balanceThreshold}
                status={balanceStatus}
                paused={paymentsPaused}
                pauseReason={pauseReason}
                lastUpdated={balanceUpdatedAt}
              />
            </Card>

            <Card title="Balance History" description="Recent wallet snapshots streamed from the backend">
              <BalanceHistoryChart points={balanceHistory} threshold={balanceThreshold} />
            </Card>

            <Card title="Autonomy Metrics" description="Queue depth, payment health, facilitator outcomes">
              <MetricsPanel queue={queue} transactions={transactions} ledger={ledger} />
            </Card>

            <Card title="Autonomy Queue" description="Scheduler health and prioritization">
              <QueueStatus tasks={queue} />
            </Card>

            <Card title="Recent Payments" description="Solana Devnet transaction history">
              <TransactionList transactions={transactions} />
            </Card>
          </div>
        </section>

        <Card title="Ledger Events" description="Append-only ledger mirroring ./logs/transaction-audit.json">
          <LedgerTimeline entries={ledger} />
        </Card>
      </div>
    </>
  );
}

