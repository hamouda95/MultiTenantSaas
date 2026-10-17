import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Lock, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from './button';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-surface-2 p-3 text-muted">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <div>
        <p className="font-medium text-fg">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Affiche une erreur d'API, avec un état dédié pour le 403 (permission RBAC manquante). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.isForbidden) {
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="Accès refusé"
        description={`Votre rôle ne vous donne pas accès à cette section. ${error.message}`}
      />
    );
  }
  const message = error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
  return (
    <EmptyState
      icon={<AlertTriangle className="h-6 w-6 text-danger" />}
      title="Impossible de charger les données"
      description={message}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
        )
      }
    />
  );
}

export function FormError({ message, details }: { message?: string | null; details?: string[] }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
      <p className="font-medium">{message}</p>
      {details && details.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
