import { SystemProgram, Transaction, Connection, LAMPORTS_PER_SOL, PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '@db/client';
import { env } from '@config/env';
import { appendLedgerEntry } from '@utils/ledger';
import { generateTxHash } from '@utils/signature';
import { getActiveSession, incrementSessionUsage } from '@services/sessionService';
import { facilitatorEnabled, submitFacilitatorVerification } from '@services/facilitatorService';

export interface ExecutePaymentInput {
  requestId: string;
  sessionId?: string;
}

const connection = new Connection(env.SOLANA_RPC_URL, 'confirmed');
let simulatedBalance = 1.5;

export async function getSimulatedBalance() {
  const signer = getCustodialSigner();
  if (signer) {
    try {
      const lamports = await connection.getBalance(signer.publicKey);
      return lamports / LAMPORTS_PER_SOL;
    } catch (_error) {
      // ignore RPC errors and fall back to simulated balance
    }
  }
  return simulatedBalance;
}

export async function executePayment({ requestId, sessionId }: ExecutePaymentInput) {
  const request = await prisma.agentRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    throw Object.assign(new Error(`Request ${requestId} not found`), { status: 404 });
  }

  if (request.status === 'FULFILLED') {
    return {
      status: 'already-fulfilled' as const,
      txHash: request.paymentHash,
      balance: await getSimulatedBalance()
    };
  }

  if (request.status !== 'PAYMENT_REQUIRED') {
    return {
      status: 'noop' as const,
      txHash: request.paymentHash,
      balance: await getSimulatedBalance()
    };
  }

  const signer = getCustodialSigner();
  if (!signer) {
    return executeSimulatedPayment(request);
  }

  if (sessionId) {
    const session = await getActiveSession(sessionId);
    if (!session) {
      throw Object.assign(new Error('Session expired or invalid'), { status: 401 });
    }
  }

  try {
    const decimalAmount = new Decimal(request.amount?.toString() ?? '0');
    const lamports = Math.max(1, Math.round(decimalAmount.toNumber() * LAMPORTS_PER_SOL));
    const recipient = new PublicKey(env.PAYMENT_RECIPIENT_PUBLIC_KEY);

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');

    const transaction = new Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: latestBlockhash.blockhash
    }).add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: recipient,
        lamports
      })
    );

    transaction.sign(signer);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false
    });

    await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      },
      'confirmed'
    );

    const payment = await prisma.payment.create({
      data: {
        requestId: request.id,
        txHash: signature,
        amount: decimalAmount,
        currency: request.currency,
        status: 'CONFIRMED',
        confirmedAt: new Date()
      }
    });

    await prisma.agentRequest.update({
      where: { id: request.id },
      data: { status: 'PAID', paymentHash: signature }
    });

    if (sessionId) {
      await incrementSessionUsage(sessionId);
    }

    const balanceLamports = await connection.getBalance(signer.publicKey);
    const balance = balanceLamports / LAMPORTS_PER_SOL;

    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'PAYMENT',
      event: 'confirmed',
      requestId: payment.requestId,
      paymentId: payment.id,
      txHash: payment.txHash,
      metadata: {
        amount: decimalAmount.toNumber(),
        currency: payment.currency,
        balance,
        type: 'on-chain'
      }
    });

    if (facilitatorEnabled()) {
      await submitFacilitatorVerification({
        requestId: request.id,
        paymentId: payment.id,
        txHash: payment.txHash,
        amount: decimalAmount.toNumber(),
        currency: payment.currency,
        endpoint: request.endpoint
      });
    }

    return {
      status: 'confirmed' as const,
      txHash: payment.txHash,
      balance
    };
  } catch (error) {
    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'PAYMENT',
      event: 'failed',
      requestId: request.id,
      metadata: {
        error: error instanceof Error ? error.message : 'unknown',
        type: 'on-chain'
      }
    });

    await prisma.payment.create({
      data: {
        requestId: request.id,
        txHash: generateTxHash(),
        amount: new Decimal(request.amount?.toString() ?? '0'),
        currency: request.currency,
        status: 'FAILED',
        failureCode: error instanceof Error ? error.message : 'unknown'
      }
    });

    throw error;
  }
}

function getCustodialSigner(): Keypair | null {
  if (!env.PHANTOM_SESSION_PRIVATE_KEY) {
    return null;
  }

  try {
    const secretKey = bs58.decode(env.PHANTOM_SESSION_PRIVATE_KEY);
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[backend] failed to decode PHANTOM_SESSION_PRIVATE_KEY', error);
    return null;
  }
}

async function executeSimulatedPayment(
  request: NonNullable<Awaited<ReturnType<typeof prisma.agentRequest.findUnique>>>
) {
  const amount = Number(request.amount ?? 0);
  if (simulatedBalance - amount < 0) {
    await appendLedgerEntry({
      timestamp: new Date().toISOString(),
      category: 'BALANCE',
      event: 'low-balance',
      requestId: request.id,
      metadata: { amount, balance: simulatedBalance, threshold: env.BALANCE_THRESHOLD }
    });

    throw Object.assign(new Error('Insufficient simulated balance for payment'), { status: 402 });
  }

  simulatedBalance = Math.max(0, simulatedBalance - amount);
  const txHash = generateTxHash();

  const payment = await prisma.payment.create({
    data: {
      requestId: request.id,
      txHash,
      amount: new Decimal(request.amount?.toString() ?? '0'),
      currency: request.currency,
      status: 'CONFIRMED',
      confirmedAt: new Date()
    }
  });

  await prisma.agentRequest.update({
    where: { id: request.id },
    data: { status: 'PAID', paymentHash: txHash }
  });

  await appendLedgerEntry({
    timestamp: new Date().toISOString(),
    category: 'PAYMENT',
    event: 'simulated-confirmed',
    requestId: payment.requestId,
    paymentId: payment.id,
    txHash: payment.txHash,
    metadata: {
      amount,
      currency: payment.currency,
      balance: simulatedBalance,
      type: 'simulated'
    }
  });

  return {
    status: 'confirmed' as const,
    txHash: payment.txHash,
    balance: simulatedBalance
  };
}

