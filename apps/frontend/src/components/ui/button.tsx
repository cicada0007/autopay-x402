import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ring-offset-slate-950',
  {
    variants: {
      variant: {
        primary: 'bg-solana-500 text-white hover:bg-solana-600',
        secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700',
        ghost: 'bg-transparent text-slate-100 hover:bg-slate-800',
        success: 'bg-cash-500 text-slate-900 hover:bg-cash-600'
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-12 px-6'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={clsx(buttonVariants({ variant, size }), className)} {...props} />
  )
);

Button.displayName = 'Button';

