import { Injectable } from '@nestjs/common';
import { ORPCError } from '@orpc/nest';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CreateItemRequestType,
  DeleteItemRequestType,
  GetItemRequestType,
  ListItemsRequestType,
  UpdateItemRequestType,
} from 'bp-contracts/item/requests';
import type {
  CreateItemResponseType,
  GetItemResponseType,
  ListItemsResponseType,
  UpdateItemResponseType,
} from 'bp-contracts/item/responses';
import { ItemEntity } from '../entities/item.entity.js';
import { CacheService } from '../../config/cache.config.js';

function serializeItem(item: ItemEntity) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    status: item.status as 'active' | 'inactive',
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    private readonly cacheService: CacheService,
  ) {}

  async listItems(input: ListItemsRequestType): Promise<ListItemsResponseType> {
    const { page, perPage, status } = input;
    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    const [items, total] = await this.itemRepo.findAndCount({
      where: where as never,
      skip: (page - 1) * perPage,
      take: perPage,
      order: { createdAt: 'DESC' },
    });

    const lastPage = Math.ceil(total / perPage) || 1;

    return {
      data: items.map(serializeItem),
      meta: {
        total,
        lastPage,
        perPage,
        currentPage: page,
      },
    };
  }

  async getItem(input: GetItemRequestType): Promise<GetItemResponseType> {
    const { itemId } = input;
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) {
      throw new ORPCError('NOT_FOUND', { message: `Item not found for id "${itemId}"` });
    }
    return serializeItem(item);
  }

  async createItem(input: CreateItemRequestType): Promise<CreateItemResponseType> {
    const { name, description, status } = input;
    const item = this.itemRepo.create({
      name,
      description: description ?? null,
      status,
    });
    const saved = await this.itemRepo.save(item);
    await this.cacheService.delByPattern('items:*');
    return serializeItem(saved);
  }

  async updateItem(input: UpdateItemRequestType): Promise<UpdateItemResponseType> {
    const { itemId, name, description, status } = input;
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) {
      throw new ORPCError('NOT_FOUND', { message: `Item not found for id "${itemId}"` });
    }

    if (name !== undefined) {
      item.name = name;
    }
    if (description !== undefined) {
      item.description = description;
    }
    if (status !== undefined) {
      item.status = status;
    }

    const saved = await this.itemRepo.save(item);
    await this.cacheService.del(`item:${itemId}`);
    await this.cacheService.delByPattern('items:*');
    return serializeItem(saved);
  }

  async deleteItem(input: DeleteItemRequestType): Promise<void> {
    const { itemId } = input;
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) {
      throw new ORPCError('NOT_FOUND', { message: `Item not found for id "${itemId}"` });
    }
    await this.itemRepo.softRemove(item);
    await this.cacheService.del(`item:${itemId}`);
    await this.cacheService.delByPattern('items:*');
  }
}
