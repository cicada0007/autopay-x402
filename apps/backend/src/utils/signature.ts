import crypto from 'crypto';

export function generateTxHash(): string {
  return crypto.randomBytes(32).toString('hex');
}

