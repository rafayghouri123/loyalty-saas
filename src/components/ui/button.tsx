import { Slot } from '@radix-ui/react-slot';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes } from 'react';

export function Button({ asChild = false, variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const Component = asChild ? Slot : 'button';
  return <Component className={twMerge(clsx('button', `button-${variant}`, className))} {...props} />;
}
