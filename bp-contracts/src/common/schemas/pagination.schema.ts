import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const PaginationMetaSchema = z.object({
  total: z.number().int().min(0),
  lastPage: z.number().int().min(0),
  perPage: z.number().int().min(1),
  currentPage: z.number().int().min(1),
});
