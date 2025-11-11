'use client';

import { useCallback, useEffect } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast, Toaster } from 'react-hot-toast';

import { AutonomySelector } from '@/components/AutonomySelector';
import { BalanceMonitor } from '@/components/BalanceMonitor';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LedgerTimeline } from '@/components/LedgerTimeline';
import { PaymentFlowVisualizer } from '@/components/PaymentFlowVisualizer';
import { TransactionList } from '@/components/TransactionList';
import { WalletConnectButton } from '@/components/WalletConnectButton';
import {
  executePayment,
  fetchBalance,
  fetchLedger,
  fetchTransactions,
  requestPremiumData
} from '@/lib/api';
import { useAgentStore, type LedgerEntry, type TransactionEntry } from '@/stores/useAgentStore';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { autonomyPhase, request, setRequest, setBalance, balance, ledger, setLedger, transactions, setTransactions } =
    useAgentStore();

  const { refetch: refreshBalance } = useQuery({
    queryKey: ['balance'],
    queryFn: fetchBalance,
    enabled: false
  });

  const { refetch: refreshLedger } = useQuery({
    queryKey: ['ledger'],
    queryFn: fetchLedger,
    enabled: false
  });

  const { refetch: refreshTransactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
    enabled: false
  });

  const syncTelemetry = useCallback(async () => {
    const [balanceResult, ledgerResult, transactionResult] = await Promise.all([
      refreshBalance(),
      refreshLedger(),
      refreshTransactions()
    ]);

    const balanceValue =
      typeof balanceResult.data === 'number' ? (balanceResult.data as number) : balance;
    const ledgerEntries: LedgerEntry[] = Array.isArray(ledgerResult.data)
      ? (ledgerResult.data as Array<Record<string, unknown>>).map((entry) => ({
          timestamp: String(entry.timestamp ?? new Date().toISOString()),
          category: String(entry.category ?? 'REQUEST'),
          event: String(entry.event ?? 'ingested'),
          requestId: entry.requestId ? String(entry.requestId) : undefined,
          paymentId: entry.paymentId ? String(entry.paymentId) : undefined,
          txHash: entry.txHash ? String(entry.txHash) : undefined,
          metadata: (entry.metadata as Record<string, unknown> | undefined) ?? undefined
        }))
      : ledger;
    const transactionEntries: TransactionEntry[] = Array.isArray(transactionResult.data)
      ? (transactionResult.data as Array<Record<string, unknown>>).map((tx, index) => ({
          id: String(tx.id ?? `tx-${index}`),
          requestId: String(tx.requestId ?? ''),
          txHash: String(tx.txHash ?? ''),
          currency: String(tx.currency ?? 'USDC'),
          amount: String(tx.amount ?? 0),
          status: String(tx.status ?? 'PENDING'),
          confirmedAt: tx.confirmedAt ? String(tx.confirmedAt) : null,
          createdAt: String(tx.createdAt ?? new Date().toISOString())
        }))
      : transactions;

    setBalance(balanceValue);
    setLedger(ledgerEntries);
    setTransactions(
      transactionEntries.map((tx) => ({
        id: String(tx.id),
        requestId: String(tx.requestId),
        txHash: String(tx.txHash),
        currency: String(tx.currency),
        amount: String(tx.amount),
        status: String(tx.status),
        confirmedAt: tx.confirmedAt ? String(tx.confirmedAt) : null,
        createdAt: String(tx.createdAt)
      }))
    );
  }, [
    refreshBalance,
    refreshLedger,
    refreshTransactions,
    setBalance,
    setLedger,
    setTransactions,
    balance,
    ledger,
    transactions
  ]);

  useEffect(() => {
    syncTelemetry().catch((error) => {
      console.error('Failed to sync telemetry', error);
    });

    const interval = setInterval(() => {
      syncTelemetry().catch(() => undefined);
    }, 8000);

    return () => clearInterval(interval);
  }, [syncTelemetry]);

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
        syncTelemetry().catch(() => undefined);
      } else {
        setRequest({
          endpoint,
          status: 'payment-required',
          requestId: outcome.instructions.requestId,
          instructions: outcome.instructions
        });
        toast('Payment required', { icon: '💳' });

        if (autonomyPhase === 3) {
          await handlePayment(outcome.instructions.requestId);
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
      setBalance(result.balance);
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
    } finally {
      queryClient.invalidateQueries({ queryKey: ['transactions'] }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ['ledger'] }).catch(() => undefined);
      syncTelemetry().catch(() => undefined);
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
                    disabled={request.status !== 'payment-required'}
                  >
                    Execute Payment
                  </Button>
                )}
              </div>
            }
          >
            <PaymentFlowVisualizer state={request} />
          </Card>

          <div className="space-y-6">
            <Card title="Wallet Health" description="Simulated Devnet balance">
              <BalanceMonitor balance={balance} threshold={0.05} />
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

