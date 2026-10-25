import { z } from 'zod';

export const ToggleModuleDtoSchema = z.object({
  isEnabled: z.boolean(),
  configuration: z.record(z.string(), z.unknown()).optional().default({}),
});

export type ToggleModuleDto = z.infer<typeof ToggleModuleDtoSchema>;
