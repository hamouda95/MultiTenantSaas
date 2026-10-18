import { z } from 'zod';

export const UpdateSettingsDtoSchema = z.object({
  logoUrl: z.string().url('Logo must be a valid URL').refine(v => /^https?:\/\//i.test(v), 'Logo must use HTTP or HTTPS').optional().nullable(),
  primaryColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Primary color must be a valid hex color code')
    .optional(),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Accent color must be a valid hex color code')
    .optional(),
  themeMode: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
  customDomain: z
    .string()
    .max(255)
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Custom domain must be a valid domain format without protocol or spaces')
    .optional()
    .nullable(),
});

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsDtoSchema>;
