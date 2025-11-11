'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function WalletConnectButton() {
  const [connected, setConnected] = useState(false);

  return (
    <Button
      variant={connected ? 'secondary' : 'primary'}
      onClick={() => setConnected((current) => !current)}
      aria-pressed={connected}
    >
      {connected ? 'Phantom Connected' : 'Connect Phantom (Simulated)'}
    </Button>
  );
}

