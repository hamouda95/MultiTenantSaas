import { z } from 'zod';

export const ToggleModuleDtoSchema = z.object({
  isEnabled: z.boolean(),
  configuration: z.record(z.unknown()).optional().default({}),
});

export type ToggleModuleDto = z.infer<typeof ToggleModuleDtoSchema>;
