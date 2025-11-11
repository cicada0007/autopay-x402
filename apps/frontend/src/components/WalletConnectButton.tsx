'use client';

import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';

function truncate(publicKey: string) {
  return `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`;
}

export function WalletConnectButton() {
  const { connect, disconnect, connected, connecting, publicKey } = useWallet();

  const handleClick = useCallback(async () => {
    try {
      if (connected) {
        await disconnect();
        toast.success('Wallet disconnected');
      } else {
        await connect();
        toast.success('Phantom connected');
      }
    } catch (error) {
      console.error('Wallet connection error', error);
      toast.error(error instanceof Error ? error.message : 'Wallet connection failed');
    }
  }, [connected, connect, disconnect]);

  return (
    <Button
      variant={connected ? 'secondary' : 'primary'}
      onClick={handleClick}
      aria-pressed={connected}
      disabled={connecting}
    >
      {connecting
        ? 'Connecting...'
        : connected && publicKey
          ? `Connected: ${truncate(publicKey.toBase58())}`
          : 'Connect Phantom Wallet'}
    </Button>
  );
}

