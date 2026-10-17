'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Plus,
  Puzzle,
  ScrollText,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { LAST_TENANT_KEY, useAuth, useTenantAccess, useWorkspaces } from '@/lib/auth';
import { cn, initials } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useTenantSettings } from '@/components/tenant-theme';
import { CreateWorkspaceDialog } from '@/components/create-workspace-dialog';

const NAV = [
  { href: '', label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: '/members', label: 'Membres', icon: Users },
  { href: '/modules', label: 'Modules', icon: Puzzle },
  { href: '/settings', label: 'Apparence', icon: Palette },
  { href: '/audit', label: "Journal d'audit", icon: ScrollText },
] as const;

/** Popover minimal : fermeture au clic extérieur et sur Échap. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function TenantLogo({ name, logoUrl, className }: { name: string; logoUrl?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={`Logo ${name}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('rounded-lg bg-white object-contain p-0.5', className)}
      />
    );
  }
  return (
    <div className={cn('flex items-center justify-center rounded-lg bg-brand text-xs font-bold text-brand-fg', className)}>
      {initials(name)}
    </div>
  );
}

function WorkspaceSwitcher({ tenantId, name, logoUrl }: { tenantId: string; name: string; logoUrl?: string | null }) {
  const router = useRouter();
  const { open, setOpen, ref } = usePopover();
  const { data: workspaces } = useWorkspaces();
  const [creating, setCreating] = useState(false);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-2 text-left transition hover:bg-surface-2"
      >
        <TenantLogo name={name} logoUrl={logoUrl} className="h-9 w-9 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block text-xs text-muted">Changer d'organisation</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 animate-fade-in overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        >
          <ul className="max-h-64 overflow-y-auto p-1">
            {workspaces?.map((w) => (
              <li key={w.tenantId}>
                <button
                  role="option"
                  aria-selected={w.tenantId === tenantId}
                  onClick={() => {
                    setOpen(false);
                    window.localStorage.setItem(LAST_TENANT_KEY, w.tenantId);
                    router.push(`/t/${w.tenantId}`);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-2 text-[10px] font-bold">
                    {initials(w.name)}
                  </span>
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.tenantId === tenantId && <Check className="h-4 w-4 text-accent" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-1">
            <button
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Plus className="h-4 w-4" /> Nouvelle organisation
            </button>
            <Link
              href="/workspaces"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
            >
              <LayoutDashboard className="h-4 w-4" /> Toutes les organisations
            </Link>
          </div>
        </div>
      )}
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { open, setOpen, ref } = usePopover();
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu utilisateur"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-fg ring-offset-2 transition hover:opacity-90"
      >
        {initials(user.fullName || user.email)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-64 animate-fade-in rounded-lg border border-border bg-surface p-1 shadow-xl"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            {user.isPlatformAdmin && (
              <Badge tone="accent" className="mt-1.5">
                Admin plateforme
              </Badge>
            )}
          </div>
          <button
            role="menuitem"
            onClick={logout}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-2"
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { workspace, roles } = useTenantAccess(tenantId);
  const { data: tenant } = useQuery({ queryKey: ['tenant', tenantId], queryFn: () => api.tenant(tenantId) });
  const { data: settings } = useTenantSettings(tenantId);

  const name = tenant?.name ?? workspace?.name ?? 'Organisation';
  const base = `/t/${tenantId}`;

  useEffect(() => setMobileOpen(false), [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <WorkspaceSwitcher tenantId={tenantId} name={name} logoUrl={settings?.settings.logoUrl} />
      <nav aria-label="Navigation principale" className="flex-1 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const full = `${base}${href}`;
          const active = href === '' ? pathname === base : pathname.startsWith(full);
          return (
            <Link
              key={label}
              href={full}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                active ? 'bg-accent-tint text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
        <p className="mb-1.5 font-medium text-fg">Votre rôle</p>
        <div className="flex flex-wrap gap-1">
          {roles.length ? roles.map((r) => <Badge key={r} className="bg-surface">{r}</Badge>) : <span>Aucun rôle</span>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-border bg-surface lg:block">
        {sidebar}
      </aside>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in-left border-r border-border bg-surface">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 rounded-md p-1 text-muted hover:bg-surface-2"
              aria-label="Fermer le menu"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="h-full pt-10">{sidebar}</div>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-muted hover:bg-surface-2 lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="truncate text-sm text-muted lg:hidden">{name}</p>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
