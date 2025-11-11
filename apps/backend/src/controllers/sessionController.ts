import type { Request, Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '@middleware/asyncHandler';
import {
  getActiveSession,
  getSession,
  incrementSessionUsage,
  issueSession,
  refreshSession,
  revokeSession
} from '@services/sessionService';

const issueSchema = z.object({
  walletPublicKey: z.string().min(32),
  sessionPublicKey: z.string().min(32),
  nonce: z.string().min(8),
  maxSignatures: z.number().int().positive().optional(),
  ttlSeconds: z.number().int().positive().optional()
});

export const issueSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = issueSchema.parse(req.body);
  const session = await issueSession(payload);
  res.status(201).json(session);
});

const sessionIdSchema = z.object({
  sessionId: z.string().min(10)
});

export const getSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = sessionIdSchema.parse(req.params);
  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }
  res.json(session);
});

export const getActiveSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = sessionIdSchema.parse(req.params);
  const session = await getActiveSession(sessionId);
  if (!session) {
    res.status(404).json({ message: 'Active session not found' });
    return;
  }
  res.json(session);
});

export const refreshSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = sessionIdSchema.parse(req.params);
  const ttlSchema = z.object({
    ttlSeconds: z.number().int().positive().optional()
  });
  const { ttlSeconds } = ttlSchema.parse(req.body ?? {});
  const session = await refreshSession(sessionId, ttlSeconds);
  res.json(session);
});

export const revokeSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = sessionIdSchema.parse(req.params);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'manual-revoke';
  const session = await revokeSession(sessionId, reason);
  res.json(session);
});

export const incrementSessionUsageHandler = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = sessionIdSchema.parse(req.params);
  const session = await incrementSessionUsage(sessionId);
  res.json(session);
});

