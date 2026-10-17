import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted',
        'transition focus-visible:border-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
});

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Libellé + champ + aide/erreur correctement reliés pour l'accessibilité. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const descId = error || hint ? `${id}-desc` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': descId })}
      {(error || hint) && (
        <p id={descId} className={cn('text-xs', error ? 'text-danger' : 'text-muted')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
