import { prisma } from '../lib/prisma.js';
import { Variant } from '@prisma/client';

export interface VariantStats {
  variant: Variant;
  signups: number;
  coupon_designed: number;
  coupon_published: number;
  coupon_designed_rate: number;
  coupon_published_rate: number;
}

export interface FunnelStats {
  variant_a: VariantStats;
  variant_b: VariantStats;
}

async function getVariantStats(variant: Variant): Promise<VariantStats> {
  const [signups, couponDesigned, couponPublished] = await Promise.all([
    prisma.advertiser.count({ where: { variant } }),
    prisma.advertiser.count({ where: { variant, firstCouponAt: { not: null } } }),
    prisma.advertiser.count({ where: { variant, firstPublishAt: { not: null } } }),
  ]);

  return {
    variant,
    signups,
    coupon_designed: couponDesigned,
    coupon_published: couponPublished,
    coupon_designed_rate: signups > 0 ? couponDesigned / signups : 0,
    coupon_published_rate: signups > 0 ? couponPublished / signups : 0,
  };
}

export async function getFunnelStats(): Promise<FunnelStats> {
  const [variant_a, variant_b] = await Promise.all([
    getVariantStats(Variant.A),
    getVariantStats(Variant.B),
  ]);
  return { variant_a, variant_b };
}
