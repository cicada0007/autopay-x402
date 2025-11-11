import fs from 'fs';
import path from 'path';

import { env } from '@config/env';

export interface LedgerEntry {
  timestamp: string;
  category: string;
  event: string;
  requestId?: string;
  paymentId?: string;
  txHash?: string;
  metadata?: Record<string, unknown>;
}

function ensureLedgerFile(): string {
  const ledgerPath = path.resolve(process.cwd(), env.AUDIT_LOG_PATH);
  const directory = path.dirname(ledgerPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  if (!fs.existsSync(ledgerPath)) {
    fs.writeFileSync(ledgerPath, JSON.stringify([], null, 2), 'utf-8');
  }
  return ledgerPath;
}

export async function appendLedgerEntry(entry: LedgerEntry): Promise<void> {
  const ledgerPath = ensureLedgerFile();
  const fileContents = await fs.promises.readFile(ledgerPath, 'utf-8');
  const parsed = JSON.parse(fileContents) as LedgerEntry[];
  parsed.push(entry);
  await fs.promises.writeFile(ledgerPath, JSON.stringify(parsed, null, 2));
}

export async function readLedger(): Promise<LedgerEntry[]> {
  const ledgerPath = ensureLedgerFile();
  const fileContents = await fs.promises.readFile(ledgerPath, 'utf-8');
  return JSON.parse(fileContents) as LedgerEntry[];
}

