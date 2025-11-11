import { EventEmitter } from 'events';

export type AutonomyEvent =
  | { type: 'bootstrap'; payload: unknown }
  | { type: 'ledger-entry'; payload: unknown }
  | { type: 'balance-snapshot'; payload: unknown }
  | { type: 'queue-update'; payload: unknown }
  | { type: 'payment-status'; payload: unknown };

const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emitEvent(event: AutonomyEvent) {
  bus.emit('event', event);
}

export function subscribe(listener: (event: AutonomyEvent) => void) {
  bus.on('event', listener);
  return () => {
    bus.off('event', listener);
  };
}


