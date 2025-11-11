'use client';

import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/stores/useAgentStore';

const modes: Array<{ label: string; value: 1 | 2 | 3; description: string }> = [
  { label: 'Phase 1 · Demo', value: 1, description: 'Server-triggered requests only' },
  { label: 'Phase 2 · Interactive', value: 2, description: 'Browser approves payments' },
  { label: 'Phase 3 · Full', value: 3, description: 'Autonomous payment execution' }
];

export function AutonomySelector() {
  const phase = useAgentStore((state) => state.autonomyPhase);
  const setPhase = useAgentStore((state) => state.setAutonomyPhase);

  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((mode) => (
        <Button
          key={mode.value}
          variant={phase === mode.value ? 'success' : 'ghost'}
          size="sm"
          onClick={() => setPhase(mode.value)}
          aria-pressed={phase === mode.value}
        >
          {mode.label}
        </Button>
      ))}
    </div>
  );
}

