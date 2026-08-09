import { oc } from '@orpc/contract';
import { HttpStatusCode } from '../../common/schemas/index.js';
import {
  CreateItemRequestSchema,
  DeleteItemRequestSchema,
  GetItemRequestSchema,
  ListItemsRequestSchema,
  UpdateItemRequestSchema,
} from '../requests/index.js';
import {
  CreateItemResponseSchema,
  GetItemResponseSchema,
  ListItemsResponseSchema,
  UpdateItemResponseSchema,
} from '../responses/index.js';

const basePath = '/items';

export const itemRoutes = {
  listItems: oc
    .route({
      method: 'GET',
      path: `${basePath}`,
      successStatus: HttpStatusCode.OK,
    })
    .input(ListItemsRequestSchema)
    .output(ListItemsResponseSchema),

  getItem: oc
    .route({
      method: 'GET',
      path: `${basePath}/{itemId}`,
      successStatus: HttpStatusCode.OK,
    })
    .input(GetItemRequestSchema)
    .output(GetItemResponseSchema),

  createItem: oc
    .route({
      method: 'POST',
      path: `${basePath}`,
      successStatus: HttpStatusCode.CREATED,
    })
    .input(CreateItemRequestSchema)
    .output(CreateItemResponseSchema),

  updateItem: oc
    .route({
      method: 'PUT',
      path: `${basePath}/{itemId}`,
      successStatus: HttpStatusCode.OK,
    })
    .input(UpdateItemRequestSchema)
    .output(UpdateItemResponseSchema),

  deleteItem: oc
    .route({
      method: 'DELETE',
      path: `${basePath}/{itemId}`,
      successStatus: HttpStatusCode.NO_CONTENT,
    })
    .input(DeleteItemRequestSchema),
};
