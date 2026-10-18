import { z } from 'zod';
export const LoginDtoSchema = z.object({
  email: z.string().email().max(255).transform(v => v.toLowerCase()),
  password: z.string().min(12).max(128),
});
export const RegisterDtoSchema = LoginDtoSchema.extend({ fullName: z.string().trim().min(2).max(255), invitationToken: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export type LoginDto = z.infer<typeof LoginDtoSchema>;
