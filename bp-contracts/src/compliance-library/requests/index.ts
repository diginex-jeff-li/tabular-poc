import { z } from 'zod';
import { PaginationSchema } from '../../common/schemas/index.js';

export const BulkSaveRequestSchema = z.object({
  upserts: z.array(z.record(z.string(), z.unknown())),
  deletes: z.array(z.string()),
});

export type BulkSaveRequestType = z.infer<typeof BulkSaveRequestSchema>;

export const ListComplianceLibraryRequestSchema = PaginationSchema;

export type ListComplianceLibraryRequestType = z.infer<
  typeof ListComplianceLibraryRequestSchema
>;
