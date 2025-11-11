import crypto from 'crypto';

import { addSeconds, differenceInSeconds, isAfter } from 'date-fns';
import type { AutonomyTask, Prisma } from '@prisma/client';

import { prisma } from '@db/client';
import { env } from '@config/env';
import {
  createOrGetRequest,
  listPremiumOfferings,
  type PremiumEndpoint,
  type PremiumOffering
} from '@services/agentService';
import { executePayment } from '@services/paymentService';
import { ensurePaymentsActive } from '@services/balanceService';
import { getActiveSession, issueSession, type IssueSessionInput } from '@services/sessionService';
import { appendLedgerEntry } from '@utils/ledger';
import { emitEvent } from '@events/eventBus';

const DEFAULT_INTERVAL_MS = Math.max(5, env.AUTONOMY_QUEUE_INTERVAL_SECONDS ?? 20) * 1000;
const MIN_SCORE_TO_RUN = env.AUTONOMY_MIN_RUN_SCORE ?? 0.5;
const MAX_BACKOFF_SECONDS = env.AUTONOMY_MAX_BACKOFF_SECONDS ?? 900;

type TaskConfig = {
  offering: PremiumOffering;
  valueScore: number;
  freshnessSeconds: number;
  backoffSeconds: number;
};

const offeringLookup = listPremiumOfferings().reduce<Record<PremiumEndpoint, PremiumOffering>>((acc, offering) => {
  acc[offering.endpoint as PremiumEndpoint] = offering;
  return acc;
}, {} as Record<PremiumEndpoint, PremiumOffering>);

const taskCatalog: Record<PremiumEndpoint, TaskConfig> = {
  market: {
    offering: offeringLookup.market,
    valueScore: 5,
    freshnessSeconds: 120,
    backoffSeconds: 45
  },
  knowledge: {
    offering: offeringLookup.knowledge,
    valueScore: 2,
    freshnessSeconds: 600,
    backoffSeconds: 120
  }
};

let schedulerHandle: NodeJS.Timeout | null = null;
let schedulerSessionId: string | null = null;

export function computeTaskScore(task: AutonomyTask, now = new Date()): number {
  const freshnessSeconds = task.lastSuccessAt
    ? Math.max(1, differenceInSeconds(now, task.lastSuccessAt))
    : task.freshnessSeconds * 2;
  const freshnessFactor = freshnessSeconds / Math.max(1, task.freshnessSeconds);

  if (task.cost <= 0) {
    return 0;
  }

  const raw = (freshnessFactor * task.valueScore) / task.cost;
  return Number.isFinite(raw) ? Number(raw.toFixed(4)) : 0;
}

export function calculateBackoffSeconds(base: number, failureCount: number): number {
  const exponent = Math.max(0, failureCount - 1);
  const delay = base * 2 ** exponent;
  return Math.min(delay, MAX_BACKOFF_SECONDS);
}

export async function startScheduler() {
  if (env.NODE_ENV === 'test') {
    return;
  }

  if (schedulerHandle) {
    return;
  }

  await ensureTasks();
  await broadcastQueueUpdate();

  schedulerHandle = setInterval(() => {
    runSchedulerTick().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] tick failure', error);
    });
  }, DEFAULT_INTERVAL_MS);
}

export function stopScheduler() {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}

async function ensureTasks() {
  await Promise.all(
    (Object.entries(taskCatalog) as Array<[PremiumEndpoint, TaskConfig]>).map(([endpoint, config]) => {
      return prisma.autonomyTask.upsert({
        where: { endpoint },
        create: {
          endpoint,
          valueScore: config.valueScore,
          cost: config.offering.amount,
          freshnessSeconds: config.freshnessSeconds,
          backoffSeconds: config.backoffSeconds,
          status: 'IDLE',
          nextRunAt: new Date()
        },
        update: {
          valueScore: config.valueScore,
          cost: config.offering.amount,
          freshnessSeconds: config.freshnessSeconds,
          backoffSeconds: config.backoffSeconds
        }
      });
    })
  );
}

async function runSchedulerTick() {
  await ensurePaymentsActive();

  const now = new Date();
  const tasks = await prisma.autonomyTask.findMany();
  if (!tasks.length) {
    return;
  }

  const eligible = tasks
    .filter((task) => {
      if (task.lockedAt) {
        return false;
      }
      if (task.nextRunAt && isAfter(task.nextRunAt, now)) {
        return false;
      }
      return true;
    })
    .map((task) => ({
      task,
      score: computeTaskScore(task, now)
    }))
    .filter(({ score }) => score >= MIN_SCORE_TO_RUN)
    .sort((a, b) => b.score - a.score);

  if (!eligible.length) {
    return;
  }

  const candidate = eligible[0];
  await executeTask(candidate.task, candidate.score, now);
}

async function executeTask(task: AutonomyTask, score: number, now: Date) {
  await prisma.autonomyTask.update({
    where: { id: task.id },
    data: {
      status: 'RUNNING',
      lockedAt: now,
      lastScore: score,
      lastRunAt: now,
      lastError: null
    }
  });

  try {
    const result = await createOrGetRequest(task.endpoint as PremiumEndpoint);

    if (result.outcome === 'FULFILLED') {
      await markSuccess(task.id, now, score, task.endpoint as PremiumEndpoint);
      return;
    }

    if (result.outcome === 'PAYMENT_REQUIRED') {
      const sessionId = await ensureSchedulerSession();
      const paymentResult = await executePayment({
        requestId: result.requestId,
        sessionId
      });

      if (paymentResult.status !== 'confirmed') {
        throw new Error(`Payment execution returned status ${paymentResult.status}`);
      }

      await createOrGetRequest(task.endpoint as PremiumEndpoint, result.requestId);
      await markSuccess(task.id, now, score, task.endpoint as PremiumEndpoint);
      return;
    }

    throw new Error(`Unhandled outcome ${result.outcome}`);
  } catch (error) {
    await handleFailure(task, now, error);
  }
}

async function markSuccess(taskId: string, now: Date, score: number, endpoint: PremiumEndpoint) {
  const freshnessDelay =
    taskCatalog[endpoint]?.freshnessSeconds != null
      ? Math.max(1, taskCatalog[endpoint].freshnessSeconds)
      : 60;

  const task = await prisma.autonomyTask.update({
    where: { id: taskId },
    data: {
      status: 'IDLE',
      lockedAt: null,
      lastScore: score,
      lastSuccessAt: now,
      failureCount: 0,
      nextRunAt: addSeconds(now, freshnessDelay),
      lastError: null
    }
  });

  await appendLedgerEntry({
    timestamp: now.toISOString(),
    category: 'AUTONOMY',
    event: 'task-success',
    metadata: {
      endpoint: task.endpoint,
      score
    }
  });

  await broadcastQueueUpdate();
}

async function handleFailure(task: AutonomyTask, now: Date, error: unknown) {
  const failureCount = task.failureCount + 1;
  const backoffSeconds = calculateBackoffSeconds(task.backoffSeconds, failureCount);
  const nextRun = addSeconds(now, backoffSeconds);

  await prisma.autonomyTask.update({
    where: { id: task.id },
    data: {
      status: 'BACKOFF',
      lockedAt: null,
      failureCount,
      nextRunAt: nextRun,
      lastError: error instanceof Error ? error.message : 'unknown error'
    }
  });

  await appendLedgerEntry({
    timestamp: now.toISOString(),
    category: 'AUTONOMY',
    event: 'task-failure',
    metadata: {
      endpoint: task.endpoint,
      failureCount,
      backoffSeconds,
      error: error instanceof Error ? error.message : 'unknown error'
    }
  });

  await broadcastQueueUpdate();
}

async function ensureSchedulerSession(): Promise<string> {
  if (schedulerSessionId) {
    const active = await getActiveSession(schedulerSessionId);
    if (active) {
      return schedulerSessionId;
    }
  }

  const sessionInput: IssueSessionInput = {
    walletPublicKey: env.PHANTOM_WALLET_PUBLIC_KEY,
    sessionPublicKey: `scheduler-${crypto.randomUUID()}`,
    nonce: crypto.randomUUID(),
    maxSignatures: env.SESSION_MAX_SIGNATURES,
    ttlSeconds: env.PHANTOM_SESSION_EXPIRY_SECONDS
  };

  const session = await issueSession(sessionInput);
  schedulerSessionId = session.id;
  return schedulerSessionId;
}

export async function getQueueStatus() {
  const tasks = await prisma.autonomyTask.findMany({
    orderBy: { endpoint: 'asc' }
  });

  return tasks.map((task) => {
    const score = computeTaskScore(task);
    return {
      id: task.id,
      endpoint: task.endpoint,
      status: task.status,
      score,
      lastScore: task.lastScore,
      lastRunAt: task.lastRunAt,
      lastSuccessAt: task.lastSuccessAt,
      failureCount: task.failureCount,
      nextRunAt: task.nextRunAt,
      lastError: task.lastError
    };
  });
}

async function broadcastQueueUpdate() {
  const tasks = await getQueueStatus();
  emitEvent({
    type: 'queue-update',
    payload: {
      tasks
    }
  });
}

// Exported for testing utilities
export const __internals = {
  ensureTasks,
  runSchedulerTick,
  executeTask,
  handleFailure,
  markSuccess,
  ensureSchedulerSession
};


