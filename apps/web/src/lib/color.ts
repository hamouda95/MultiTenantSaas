const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_PRIMARY = '#0F172A';
export const DEFAULT_ACCENT = '#2563EB';

export function isHex(value: string) {
  return HEX_RE.test(value);
}

/** Normalise #abc → #aabbcc (minuscules). Retourne null si invalide. */
export function normalizeHex(value: string): string | null {
  if (!isHex(value)) return null;
  let hex = value.slice(1).toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex}`;
}

/** Luminance relative WCAG. */
function luminance(hex: string) {
  const n = normalizeHex(hex) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Couleur de texte lisible (blanc ou quasi-noir) sur un fond donné. */
export function readableOn(background: string) {
  return luminance(background) > 0.4 ? '#0f172a' : '#ffffff';
}

export function brandVars(primary: string, accent: string): Record<string, string> {
  const p = normalizeHex(primary) ?? DEFAULT_PRIMARY;
  const a = normalizeHex(accent) ?? DEFAULT_ACCENT;
  return {
    '--brand-primary': p,
    '--brand-primary-fg': readableOn(p),
    '--brand-accent': a,
    '--brand-accent-fg': readableOn(a),
  };
}
