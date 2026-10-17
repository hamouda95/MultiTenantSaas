import { z } from 'zod';

/**
 * Miroirs côté client des DTO Zod de l'API (apps/api/src/common/dto).
 * Le serveur reste l'autorité : ces schémas servent uniquement à donner un retour immédiat.
 */
const hexColor = (label: string) =>
  z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, `${label} : code hexadécimal valide requis (ex. #2563EB)`);

export const loginSchema = z.object({
  email: z.string().min(1, 'Adresse e-mail requise').email('Adresse e-mail invalide').max(255),
  password: z.string().min(12, 'Au moins 12 caractères').max(128),
});

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Au moins 2 caractères').max(100),
  slug: z
    .string()
    .min(3, 'Au moins 3 caractères')
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Minuscules, chiffres et tirets uniquement'),
  placementMode: z.enum(['SHARED', 'DEDICATED']),
  primaryColor: hexColor('Couleur principale'),
});

export const addMemberSchema = z.object({
  email: z.string().min(1, 'Adresse e-mail requise').email('Adresse e-mail invalide').max(255),
  role: z.string().min(2).max(64),
});

export const settingsSchema = z.object({
  logoUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/.+/i.test(v), 'URL invalide (http:// ou https://)'),
  primaryColor: hexColor('Couleur principale'),
  accentColor: hexColor("Couleur d'accent"),
  themeMode: z.enum(['LIGHT', 'DARK', 'SYSTEM']),
  customDomain: z
    .string()
    .trim()
    .max(255)
    .refine(
      (v) => v === '' || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v),
      'Domaine invalide (sans protocole ni espaces, ex. app.exemple.com)',
    ),
});

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** Convertit une ZodError en map champ → message. */
export function fieldErrors<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; errors: FieldErrors<z.infer<T>> } {
  const res = schema.safeParse(value);
  if (res.success) return { ok: true, data: res.data };
  const errors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors: errors as FieldErrors<z.infer<T>> };
}
