import { z } from 'zod';

export const CreateTenantDtoSchema = z.object({
  name: z.string().min(2, 'Tenant name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with optional hyphens'),
  placementMode: z.enum(['SHARED', 'DEDICATED']).optional().default('SHARED'),
  primaryColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Primary color must be a valid hex color code (e.g. #0F172A)')
    .optional(),
});

export type CreateTenantDto = z.infer<typeof CreateTenantDtoSchema>;

export const AddMemberDtoSchema = z.object({
  email: z.string().email('Valid email address required').max(255),
  role: z.string().min(2).max(64).optional().default('Member'),
});

export type AddMemberDto = z.infer<typeof AddMemberDtoSchema>;
