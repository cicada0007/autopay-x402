import { addSeconds } from 'date-fns';

import { prisma } from '@db/client';
import {
  getActiveSession,
  incrementSessionUsage,
  issueSession,
  refreshSession,
  revokeSession
} from '@services/sessionService';

describe('sessionService', () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a session with default limits', async () => {
    const session = await issueSession({
      walletPublicKey: 'WalletPublicKeyExample1234567890',
      sessionPublicKey: 'SessionPublicKeyExample1234567890',
      nonce: 'nonce-123'
    });

    expect(session.maxSignatures).toBeGreaterThanOrEqual(1);
    expect(session.status).toBe('ACTIVE');
  });

  it('increments usage and marks exhausted when limit reached', async () => {
    const session = await issueSession({
      walletPublicKey: 'WalletPublicKeyExampleABCDEF123456',
      sessionPublicKey: 'SessionPublicKeyExampleABCDEF123456',
      nonce: 'nonce-abc',
      maxSignatures: 1
    });

    await incrementSessionUsage(session.id);
    const active = await getActiveSession(session.id);
    expect(active).toBeNull();
  });

  it('refreshes session expiry', async () => {
    const session = await issueSession({
      walletPublicKey: 'WalletPublicKeyRefresh1234567890',
      sessionPublicKey: 'SessionPublicKeyRefresh1234567890',
      nonce: 'nonce-refresh',
      ttlSeconds: 10
    });

    const refreshed = await refreshSession(session.id, 100);
    const expectedExpiry = addSeconds(new Date(), 100);
    expect(refreshed.expiresAt.getTime()).toBeGreaterThan(expectedExpiry.getTime() - 2000);
  });

  it('revokes session', async () => {
    const session = await issueSession({
      walletPublicKey: 'WalletPublicKeyRevoke1234567890',
      sessionPublicKey: 'SessionPublicKeyRevoke1234567890',
      nonce: 'nonce-revoke'
    });

    const revoked = await revokeSession(session.id, 'test');
    expect(revoked.status).toBe('REVOKED');
  });
});

