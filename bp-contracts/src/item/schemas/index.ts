import { z } from 'zod';

export const ItemStatusEnum = z.enum(['active', 'inactive']);
export type ItemStatusType = z.infer<typeof ItemStatusEnum>;

export const ItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: ItemStatusEnum,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ItemType = z.infer<typeof ItemSchema>;
