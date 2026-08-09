import { z } from 'zod';

export const UUIDIdSchema = z.string().uuid();
