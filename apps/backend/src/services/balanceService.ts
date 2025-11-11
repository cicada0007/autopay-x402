import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { Prisma } from '@prisma/client';

import { prisma } from '@db/client';
import { env } from '@config/env';
import { appendLedgerEntry } from '@utils/ledger';
import { emitEvent } from '@events/eventBus';

type BalanceStatus = 'OK' | 'LOW' | 'ERROR' | 'UNKNOWN';

const POLL_INTERVAL_SECONDS = env.BALANCE_POLL_INTERVAL_SECONDS ?? 30;
const POLL_INTERVAL_MS = Math.max(5, POLL_INTERVAL_SECONDS) * 1000;

const connection = new Connection(env.SOLANA_RPC_URL, 'confirmed');

let pollHandle: NodeJS.Timeout | null = null;
let resolvedWalletKey: PublicKey | null | undefined;

function resolveWalletPublicKey(): PublicKey | null {
  if (resolvedWalletKey !== undefined) {
    return resolvedWalletKey;
  }

  try {
    resolvedWalletKey = new PublicKey(env.PHANTOM_WALLET_PUBLIC_KEY);
    return resolvedWalletKey;
  } catch (_error) {
    // continue and attempt to derive from the custodial key
  }

  if (env.PHANTOM_SESSION_PRIVATE_KEY) {
    try {
      const secretKey = bs58.decode(env.PHANTOM_SESSION_PRIVATE_KEY);
      const signer = Keypair.fromSecretKey(secretKey);
      resolvedWalletKey = signer.publicKey;
      return resolvedWalletKey;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[balanceService] failed to derive wallet public key from private key', error);
    }
  }

  // eslint-disable-next-line no-console
  console.warn('[balanceService] unable to resolve payment wallet public key');
  resolvedWalletKey = null;
  return resolvedWalletKey;
}

export async function startBalanceMonitor() {
  if (env.NODE_ENV === 'test') {
    return;
  }
  if (pollHandle) {
    return;
  }

  await refreshBalanceSnapshot('startup');

  pollHandle = setInterval(() => {
    refreshBalanceSnapshot('poller').catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[balanceService] balance poll failed', error);
    });
  }, POLL_INTERVAL_MS);
}

export function stopBalanceMonitor() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

export async function refreshBalanceSnapshot(source: string = 'poller') {
  const wallet = resolveWalletPublicKey();

  if (!wallet) {
    await ingestBalanceReading(0, source, { reason: 'wallet-unavailable' }, 'ERROR');
    return;
  }

  try {
    const lamports = await connection.getBalance(wallet);
    const balance = lamports / LAMPORTS_PER_SOL;
    await ingestBalanceReading(balance, source);
  } catch (error) {
    await ingestBalanceReading(
      0,
      source,
      {
        error: error instanceof Error ? error.message : 'unknown'
      },
      'ERROR'
    );
  }
}

export async function ingestBalanceReading(
  balance: number,
  source: string,
  metadata?: Record<string, unknown>,
  overrideStatus?: BalanceStatus
) {
  const status = determineStatus(balance, overrideStatus);
  let systemState: Awaited<ReturnType<typeof ensureSystemState>>;
  const snapshot = await prisma.balanceSnapshot.create({
    data: {
      balance: new Prisma.Decimal(balance),
      status,
      source,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });

  if (status === 'LOW') {
    systemState = await ensurePaymentsPaused('LOW_BALANCE', {
      balance,
      threshold: env.BALANCE_THRESHOLD
    });
  } else if (status === 'OK') {
    systemState = await maybeResumePayments('LOW_BALANCE', {
      balance,
      threshold: env.BALANCE_THRESHOLD
    });
  } else {
    systemState = await ensureSystemState();
  }

  if (status === 'LOW' || status === 'ERROR') {
    await appendLedgerEntry({
      timestamp: snapshot.recordedAt.toISOString(),
      category: 'BALANCE',
      event: status === 'LOW' ? 'low-balance' : 'balance-error',
      metadata: {
        balance,
        status,
        source,
        ...(metadata ?? {})
      }
    });
  }

  emitEvent({
    type: 'balance-snapshot',
    payload: {
      balance,
      status,
      source,
      recordedAt: snapshot.recordedAt,
      metadata: metadata ?? null,
      paused: systemState.paymentsPaused,
      pauseReason: systemState.pauseReason ?? null,
      threshold: env.BALANCE_THRESHOLD
    }
  });

  return snapshot;
}

function determineStatus(balance: number, override?: BalanceStatus): BalanceStatus {
  if (override) {
    return override;
  }

  if (!Number.isFinite(balance)) {
    return 'ERROR';
  }

  if (balance < env.BALANCE_THRESHOLD) {
    return 'LOW';
  }

  return 'OK';
}

async function ensureSystemState() {
  const existing = await prisma.systemState.findUnique({ where: { id: 1 } });
  if (existing) {
    return existing;
  }

  return prisma.systemState.create({
    data: {
      id: 1,
      paymentsPaused: false
    }
  });
}

async function ensurePaymentsPaused(reason: string, metadata?: Record<string, unknown>) {
  const previous = await prisma.systemState.findUnique({ where: { id: 1 } });

  if (previous?.paymentsPaused) {
    return previous;
  }

  const updated = await prisma.systemState.upsert({
    where: { id: 1 },
    update: {
      paymentsPaused: true,
      pauseReason: reason
    },
    create: {
      id: 1,
      paymentsPaused: true,
      pauseReason: reason
    }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'BALANCE',
    event: 'payments-paused',
    metadata: {
      reason,
      ...(metadata ?? {})
    }
  });

  return updated;
}

async function maybeResumePayments(reasonToClear: string, metadata?: Record<string, unknown>) {
  const state = await ensureSystemState();

  if (!state.paymentsPaused || state.pauseReason !== reasonToClear) {
    return state;
  }

  const updated = await prisma.systemState.update({
    where: { id: 1 },
    data: {
      paymentsPaused: false,
      pauseReason: null
    }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'BALANCE',
    event: 'payments-resumed',
    metadata: {
      reasonCleared: reasonToClear,
      ...(metadata ?? {})
    }
  });

  return updated;
}

export async function ensurePaymentsActive() {
  const state = await ensureSystemState();

  if (state.paymentsPaused) {
    const snapshot = await getLatestSnapshot();
    const error = Object.assign(new Error('Payments temporarily paused'), {
      status: 503,
      details: {
        pauseReason: state.pauseReason,
        balance: snapshot ? snapshot.balance.toNumber() : null,
        threshold: env.BALANCE_THRESHOLD
      }
    });
    throw error;
  }
}

export async function getLatestSnapshot() {
  return prisma.balanceSnapshot.findFirst({
    orderBy: { recordedAt: 'desc' }
  });
}

export async function getBalanceSummary() {
  let snapshot = await getLatestSnapshot();

  if (!snapshot && env.NODE_ENV !== 'test') {
    await refreshBalanceSnapshot('bootstrap');
    snapshot = await getLatestSnapshot();
  }

  const state = await ensureSystemState();

  const balanceValue = snapshot ? Number(snapshot.balance) : 0;
  const status = snapshot?.status ?? ('UNKNOWN' as BalanceStatus);

  return {
    balance: balanceValue,
    status,
    threshold: env.BALANCE_THRESHOLD,
    lastUpdated: snapshot?.recordedAt ?? null,
    paused: state.paymentsPaused,
    pauseReason: state.pauseReason ?? null
  };
}


