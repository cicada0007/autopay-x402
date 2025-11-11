import type { ReactNode } from 'react';

import { clsx } from 'clsx';

interface CardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export function Card({ title, description, children, className, actions }: CardProps) {
  return (
    <section
      className={clsx(
        'rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/30',
        className
      )}
    >
      {(title || description || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-slate-100">{title}</h2>}
            {description && <p className="text-sm text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}

