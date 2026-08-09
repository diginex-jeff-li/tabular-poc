import { z } from 'zod';
import { PaginationSchema } from '../../common/schemas/index.js';
import { ComplianceLibrarySchema } from '../schemas/index.js';

export const BulkSaveRequestSchema = z.object({
  upserts: ComplianceLibrarySchema.omit({ createdAt: true, updatedAt: true }).array(),
  deletes: z.string().uuid().array(),
});

export type BulkSaveRequestType = z.infer<typeof BulkSaveRequestSchema>;

export const ListComplianceLibraryRequestSchema = PaginationSchema;

export type ListComplianceLibraryRequestType = z.infer<
  typeof ListComplianceLibraryRequestSchema
>;