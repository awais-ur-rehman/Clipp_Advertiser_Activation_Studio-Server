import { createHash } from 'crypto';
import { Variant } from '@prisma/client';

export function assignVariant(advertiserId: string): Variant {
  const hash = createHash('sha256').update(advertiserId).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % 2;
  return bucket === 0 ? Variant.A : Variant.B;
}
