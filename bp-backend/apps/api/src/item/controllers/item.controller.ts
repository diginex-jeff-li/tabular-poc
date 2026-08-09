import { Controller, Res } from '@nestjs/common';
import { implement, Implement } from '@orpc/nest';
import type { Response } from 'express';
import { itemRoutes } from 'bp-contracts/item/routes';
import { ItemService } from '../services/item.service.js';

@Controller()
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Implement(itemRoutes.listItems)
  listItems() {
    return implement(itemRoutes.listItems).handler(({ input }) => {
      return this.itemService.listItems(input);
    });
  }

  @Implement(itemRoutes.getItem)
  getItem() {
    return implement(itemRoutes.getItem).handler(({ input }) => {
      return this.itemService.getItem(input);
    });
  }

  @Implement(itemRoutes.createItem)
  createItem() {
    return implement(itemRoutes.createItem).handler(({ input }) => {
      return this.itemService.createItem(input);
    });
  }

  @Implement(itemRoutes.updateItem)
  updateItem() {
    return implement(itemRoutes.updateItem).handler(({ input }) => {
      return this.itemService.updateItem(input);
    });
  }

  @Implement(itemRoutes.deleteItem)
  deleteItem(@Res() _res: Response) {
    return implement(itemRoutes.deleteItem).handler(({ input }) => {
      return this.itemService.deleteItem(input);
    });
  }
}
