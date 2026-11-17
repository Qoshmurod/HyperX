import { z } from 'zod';
import { CLASSIFICATIONS } from '../auth/access-policy';

export const uuid = z.string().uuid();
export const classification = z.enum(CLASSIFICATIONS);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const page = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
