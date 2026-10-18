import { z } from 'zod';

export const LoginDtoSchema = z.object({
  email: z.string().email('Valid email address required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;
