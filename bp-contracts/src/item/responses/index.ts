import { z } from 'zod';
import { PaginationMetaSchema } from '../../common/schemas/index.js';
import { ItemSchema } from '../schemas/index.js';

export const ListItemsResponseSchema = z.object({
  data: z.array(ItemSchema),
  meta: PaginationMetaSchema,
});

export type ListItemsResponseType = z.infer<typeof ListItemsResponseSchema>;

export const GetItemResponseSchema = ItemSchema;
export type GetItemResponseType = z.infer<typeof GetItemResponseSchema>;

export const CreateItemResponseSchema = ItemSchema;
export type CreateItemResponseType = z.infer<typeof CreateItemResponseSchema>;

export const UpdateItemResponseSchema = ItemSchema;
export type UpdateItemResponseType = z.infer<typeof UpdateItemResponseSchema>;
