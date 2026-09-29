import type { CartLine } from '@codeshop/domain';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { BusinessError, NotFoundError } from '../../common/errors';
import { DB, type Db, type DbOrTx } from '../../db/database';
import { skus, spus, storeSamples, type DraftLine, type OrderLineSnapshot } from '../../db/schema';

export interface ProductView {
  spuId: string;
  name: string;
  skus: Array<{
    skuId: string;
    color: string;
    size: string;
    priceCents: number;
    /** 这家店有该规格的样品，可以当场试 */
    tryInStore: boolean;
  }>;
}

export type PricedLine = CartLine & Omit<OrderLineSnapshot, 'discountCents'>;

@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 店内模式商品页：全部颜色尺码，标注哪些店内可试（PRD 5）。 */
  async productAtStore(merchantId: string, storeId: string, spuId: string, tx: DbOrTx = this.db): Promise<ProductView> {
    const [spu] = await tx
      .select()
      .from(spus)
      .where(and(eq(spus.id, spuId), eq(spus.merchantId, merchantId), eq(spus.status, 'on_sale')));
    if (!spu) throw new NotFoundError('商品', 'product_not_found');

    const rows = await tx
      .select()
      .from(skus)
      .where(and(eq(skus.spuId, spuId), eq(skus.status, 'on_sale')))
      .orderBy(skus.color, skus.size);
    const samples = rows.length
      ? await tx
          .select({ skuId: storeSamples.skuId })
          .from(storeSamples)
          .where(and(eq(storeSamples.storeId, storeId), inArray(storeSamples.skuId, rows.map((r) => r.id))))
      : [];
    const sampleIds = new Set(samples.map((s) => s.skuId));

    return {
      spuId: spu.id,
      name: spu.name,
      skus: rows.map((r) => ({
        skuId: r.id,
        color: r.color,
        size: r.size,
        priceCents: r.priceCents,
        tryInStore: sampleIds.has(r.id),
      })),
    };
  }

  /** 按数据库里的价格给购物行定价。客户端传来的价格一律不采信。 */
  async priceLines(tx: DbOrTx, merchantId: string, lines: DraftLine[]): Promise<PricedLine[]> {
    if (lines.length === 0) throw new BusinessError('empty_cart', '购物车是空的');
    const skuIds = [...new Set(lines.map((l) => l.skuId))];
    const rows = await tx
      .select({
        skuId: skus.id,
        spuId: skus.spuId,
        color: skus.color,
        size: skus.size,
        priceCents: skus.priceCents,
        skuStatus: skus.status,
        name: spus.name,
        spuStatus: spus.status,
      })
      .from(skus)
      .innerJoin(spus, eq(spus.id, skus.spuId))
      .where(and(eq(skus.merchantId, merchantId), inArray(skus.id, skuIds)));
    const bySku = new Map(rows.map((r) => [r.skuId, r]));

    return lines.map((line) => {
      const row = bySku.get(line.skuId);
      if (!row || row.skuStatus !== 'on_sale' || row.spuStatus !== 'on_sale') {
        throw new BusinessError('sku_unavailable', '有商品已下架或不属于本商家', { skuId: line.skuId });
      }
      return {
        skuId: row.skuId,
        spuId: row.spuId,
        name: row.name,
        color: row.color,
        size: row.size,
        unitPriceCents: row.priceCents,
        quantity: line.quantity,
      };
    });
  }
}
