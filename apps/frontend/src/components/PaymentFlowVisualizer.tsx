'use client';

import type { ReactNode } from 'react';

import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Wallet } from 'lucide-react';

import type { RequestState } from '@/stores/useAgentStore';

interface Step {
  id: RequestState['status'];
  title: string;
  description: string;
  icon: ReactNode;
}

interface PaymentFlowVisualizerProps {
  state: RequestState | null;
}

const steps: Step[] = [
  {
    id: 'idle',
    title: 'Request',
    description: 'Trigger premium API request',
    icon: <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
  },
  {
    id: 'payment-required',
    title: 'Payment Required',
    description: 'x402 instructions parsed from response',
    icon: <Wallet className="h-6 w-6 text-cash-500" />
  },
  {
    id: 'paying',
    title: 'Executing Payment',
    description: 'Simulated Solana transaction in-flight',
    icon: <Loader2 className="h-6 w-6 animate-spin text-solana-500" />
  },
  {
    id: 'fulfilled',
    title: 'Data Unlocked',
    description: 'Premium payload available to the agent',
    icon: <CheckCircle2 className="h-6 w-6 text-emerald-400" />
  }
];

export function PaymentFlowVisualizer({ state }: PaymentFlowVisualizerProps) {
  const currentStatus = state?.status ?? 'idle';
  const previewData = state?.data ?? null;
  const hasPreview = previewData !== null && previewData !== undefined;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {steps.map((step) => {
        const active = currentStatus === step.id;
        const completed =
          currentStatus === 'fulfilled' ||
          (currentStatus === 'paying' && (step.id === 'idle' || step.id === 'payment-required'));

        return (
          <motion.div
            key={step.id}
            initial={{ opacity: 0.5, scale: 0.98 }}
            animate={{
              opacity: active || completed ? 1 : 0.6,
              scale: active ? 1.02 : 1,
              borderColor: active ? '#7c3aed' : '#1f2937'
            }}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
                {step.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">{step.title}</p>
                <p className="text-xs text-slate-400">{step.description}</p>
              </div>
            </div>
            {active && state?.instructions && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
                <p>
                  <span className="font-semibold text-slate-200">Amount:</span> {state.instructions.amount}{' '}
                  {state.instructions.currency}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-slate-200">Facilitator:</span>{' '}
                  {state.instructions.facilitatorUrl}
                </p>
              </div>
            )}
            {active && hasPreview && (
              <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-950/60 p-3 text-xs text-slate-300">
                {JSON.stringify(previewData ?? {}, null, 2)}
              </pre>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

