import { Repository } from 'typeorm';
import { ItemEntity } from '../entities/item.entity.js';

export class ItemRepository extends Repository<ItemEntity> {}
