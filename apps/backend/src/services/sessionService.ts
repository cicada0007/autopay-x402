import { addSeconds, isAfter } from 'date-fns';

import { prisma } from '@db/client';
import { env } from '@config/env';
import { appendLedgerEntry } from '@utils/ledger';

export interface IssueSessionInput {
  walletPublicKey: string;
  sessionPublicKey: string;
  nonce: string;
  maxSignatures?: number;
  ttlSeconds?: number;
}

export async function issueSession(input: IssueSessionInput) {
  const ttl = input.ttlSeconds ?? env.PHANTOM_SESSION_EXPIRY_SECONDS;
  const maxSignatures = input.maxSignatures ?? env.SESSION_MAX_SIGNATURES;
  const expiresAt = addSeconds(new Date(), ttl);

  const session = await prisma.session.create({
    data: {
      walletPublicKey: input.walletPublicKey,
      sessionPublicKey: input.sessionPublicKey,
      nonce: input.nonce,
      maxSignatures,
      expiresAt
    }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'SYSTEM',
    event: 'session-issued',
    metadata: {
      walletPublicKey: input.walletPublicKey,
      sessionPublicKey: input.sessionPublicKey,
      expiresAt: expiresAt.toISOString()
    }
  });

  return session;
}

export async function getSession(sessionId: string) {
  return prisma.session.findUnique({ where: { id: sessionId } });
}

export async function getActiveSession(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) {
    return null;
  }

  if (session.status !== 'ACTIVE') {
    return null;
  }

  if (isAfter(new Date(), session.expiresAt)) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'EXPIRED' }
    });

    return null;
  }

  if (session.signaturesUsed >= session.maxSignatures) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'EXHAUSTED' }
    });
    return null;
  }

  return session;
}

export async function incrementSessionUsage(sessionId: string) {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: {
      signaturesUsed: {
        increment: 1
      }
    }
  });

  if (session.signaturesUsed >= session.maxSignatures) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'EXHAUSTED' }
    });
  }

  return session;
}

export async function refreshSession(sessionId: string, ttlSeconds?: number) {
  const ttl = ttlSeconds ?? env.PHANTOM_SESSION_EXPIRY_SECONDS;
  const expiresAt = addSeconds(new Date(), ttl);

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: {
      expiresAt,
      status: 'ACTIVE'
    }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'SYSTEM',
    event: 'session-refreshed',
    metadata: {
      sessionId,
      expiresAt: expiresAt.toISOString()
    }
  });

  return session;
}

export async function revokeSession(sessionId: string, reason = 'manual-revoke') {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'REVOKED'
    }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'SYSTEM',
    event: 'session-revoked',
    metadata: {
      sessionId,
      reason
    }
  });

  return session;
}

