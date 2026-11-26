import { z } from 'zod';

export const BulkSaveErrorSchema = z.object({
  row: z.number().int().min(0),
  rowId: z.string(),
  field: z.string(),
  message: z.string(),
});

export type BulkSaveErrorType = z.infer<typeof BulkSaveErrorSchema>;

export const BulkSaveResponseSchema = z.object({
  errors: BulkSaveErrorSchema.array(),
  saved: z.number().int().min(0),
});

export type BulkSaveResponseType = z.infer<typeof BulkSaveResponseSchema>;
