import type { ReactNode } from 'react';

import '../styles/globals.css';

import { QueryProvider } from '@/providers/query-provider';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <QueryProvider>
          <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
            {children}
          </main>
        </QueryProvider>
      </body>
    </html>
  );
}

