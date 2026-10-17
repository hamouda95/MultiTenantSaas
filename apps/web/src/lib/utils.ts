import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const numFmt = new Intl.NumberFormat('fr-FR');

export function formatDateTime(iso: string | Date) {
  return dateFmt.format(new Date(iso));
}

export function formatDate(iso: string | Date) {
  return dayFmt.format(new Date(iso));
}

export function formatNumber(n: number | string) {
  return numFmt.format(Number(n));
}

export function formatCurrency(n: number | string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' }).format(Number(n));
}

export function formatBytes(value: number | string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

export function relativeTime(iso: string | Date) {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(iso);
}

export function slugify(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function initials(name: string) {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function percent(used: number | string, total: number | string) {
  const t = Number(total);
  if (!t) return 0;
  return Math.max(0, (Number(used) / t) * 100);
}
