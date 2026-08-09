import { z } from 'zod';
import { PaginationSchema } from '../../common/schemas/index.js';
import { ItemStatusEnum } from '../schemas/index.js';

export const ListItemsRequestSchema = PaginationSchema.extend({
  status: ItemStatusEnum.optional(),
});

export type ListItemsRequestType = z.infer<typeof ListItemsRequestSchema>;

export const GetItemRequestSchema = z.object({
  itemId: z.string().uuid(),
});

export type GetItemRequestType = z.infer<typeof GetItemRequestSchema>;

export const CreateItemRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: ItemStatusEnum.default('active'),
});

export type CreateItemRequestType = z.infer<typeof CreateItemRequestSchema>;

export const UpdateItemRequestSchema = z.object({
  itemId: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: ItemStatusEnum.optional(),
});

export type UpdateItemRequestType = z.infer<typeof UpdateItemRequestSchema>;

export const DeleteItemRequestSchema = z.object({
  itemId: z.string().uuid(),
});

export type DeleteItemRequestType = z.infer<typeof DeleteItemRequestSchema>;
