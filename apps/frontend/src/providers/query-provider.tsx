/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (failureCount) => (failureCount < 3 ? true : false)
          }
        }
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

