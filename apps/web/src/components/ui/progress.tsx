import { cn } from '@/lib/utils';

/** Barre de progression d'un quota : devient orange > 80 %, rouge > 100 %. */
export function Progress({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  const tone = value > 100 ? 'bg-danger' : value > 80 ? 'bg-warning' : 'bg-accent';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
