import { attributeStaffOrder, type OrderAttribution } from '@codeshop/domain';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { Clock } from '../../common/clock';
import { BusinessError, NotFoundError } from '../../common/errors';
import { newId } from '../../common/ids';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { DB, lockCustomerMerchant, type Db, type DbOrTx, type Tx } from '../../db/database';
import {
  guides,
  merchants,
  orderDrafts,
  orders,
  serviceRecords,
  type DraftLine,
  type OrderLineSnapshot,
} from '../../db/schema';
import { AttributionService } from '../attribution/attribution.service';
import { CatalogService, type PricedLine } from '../catalog/catalog.service';
import { CodesService, type IssuedCode } from '../codes/codes.service';
import { CouponsService } from '../coupons/coupons.service';

export interface OrderRequest {
  merchantId: string;
  lines: DraftLine[];
  couponId?: string | null;
  /** 从导购开单草稿下单时传入；此时以草稿内容为准，忽略 lines */
  draftId?: string | null;
}

export interface Quote {
  merchantId: string;
  lines: OrderLineSnapshot[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  couponId: string | null;
  attribution: OrderAttribution;
}

export type OrderRow = typeof orders.$inferSelect;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly catalog: CatalogService,
    private readonly coupons: CouponsService,
    private readonly attribution: AttributionService,
    private readonly codes: CodesService,
  ) {}

  /** 试算：价格、优惠、归属预览，不写库。 */
  async quote(customerId: string, req: OrderRequest): Promise<Quote> {
    return this.db.transaction(async (tx) => this.compute(tx, customerId, req, this.clock.now()));
  }

  /**
   * 下单。价格以数据库为准，优惠与归属在同一事务里重新计算并落库，券同时核销。
   * 支付尚未接入：订单停在 pending_payment。
   */
  async create(customerId: string, req: OrderRequest): Promise<OrderRow> {
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      await lockCustomerMerchant(tx, customerId, req.merchantId);
      const q = await this.compute(tx, customerId, req, now);
      const id = newId('od');
      const [order] = await tx
        .insert(orders)
        .values({
          id,
          merchantId: q.merchantId,
          customerId,
          source: req.draftId ? 'staff_draft' : 'self',
          draftId: req.draftId ?? null,
          lines: q.lines,
          subtotalCents: q.subtotalCents,
          discountCents: q.discountCents,
          totalCents: q.totalCents,
          couponId: q.couponId,
          attrKind: q.attribution.kind,
          attrStoreId: q.attribution.storeId,
          attrGuideId: q.attribution.guideId,
          attrBasisRecordId: q.attribution.basisRecordId,
          commissionEligible: q.attribution.commissionEligible,
          commissionIneligibleReason: q.attribution.ineligibleReason,
          createdAt: now,
        })
        .returning();
      if (q.couponId) await this.coupons.markUsed(tx, q.couponId, id);
      if (req.draftId) {
        await tx.update(orderDrafts).set({ status: 'consumed' }).where(eq(orderDrafts.id, req.draftId));
        await this.codes.voidOrderCodes(tx, req.draftId);
      }
      return order!;
    });
  }

  private async compute(tx: Tx, customerId: string, req: OrderRequest, now: Date): Promise<Quote> {
    const [merchant] = await tx.select().from(merchants).where(eq(merchants.id, req.merchantId));
    if (!merchant || merchant.status !== 'active') throw new NotFoundError('商家', 'merchant_unavailable');

    let lines: PricedLine[];
    let staffAttribution: OrderAttribution | null = null;
    if (req.draftId) {
      const draft = await this.openDraft(tx, req.draftId, req.merchantId, now);
      lines = await this.catalog.priceLines(tx, req.merchantId, draft.lines);
      staffAttribution = await this.staffAttribution(tx, customerId, draft);
    } else {
      lines = await this.catalog.priceLines(tx, req.merchantId, req.lines);
    }

    const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    let discount = 0;
    let allocations = lines.map(() => 0);
    if (req.couponId) {
      const row = await this.coupons.findForCustomer(tx, req.couponId, customerId);
      if (!row) throw new NotFoundError('优惠券', 'coupon_not_found');
      const applied = this.coupons.apply(row, { customerId, merchantId: req.merchantId, lines, now });
      if (!applied.ok) throw new BusinessError(`coupon_${applied.reason}`, couponMessage(applied.reason));
      discount = applied.discountCents;
      allocations = applied.allocations;
    }

    return {
      merchantId: req.merchantId,
      lines: lines.map((l, i) => ({
        skuId: l.skuId,
        spuId: l.spuId,
        name: l.name,
        color: l.color,
        size: l.size,
        unitPriceCents: l.unitPriceCents,
        quantity: l.quantity,
        discountCents: allocations[i] ?? 0,
      })),
      subtotalCents: subtotal,
      discountCents: discount,
      totalCents: subtotal - discount,
      couponId: req.couponId ?? null,
      attribution: staffAttribution ?? (await this.attribution.attributeSelfOrder(tx, customerId, req.merchantId, now)),
    };
  }

  private async openDraft(tx: Tx, draftId: string, merchantId: string, now: Date) {
    // 行锁：同一张开单不会被两位顾客同时下单
    const [draft] = await tx
      .select()
      .from(orderDrafts)
      .where(and(eq(orderDrafts.id, draftId), eq(orderDrafts.merchantId, merchantId)))
      .for('update');
    if (!draft || draft.status !== 'open' || draft.expiresAt.getTime() <= now.getTime()) {
      throw new NotFoundError('开单', 'draft_unavailable');
    }
    return draft;
  }

  /** 导购开单直接归开单导购；前提是这位顾客扫过这张订单码。 */
  private async staffAttribution(
    tx: DbOrTx,
    customerId: string,
    draft: typeof orderDrafts.$inferSelect,
  ): Promise<OrderAttribution> {
    const [scan] = await tx
      .select({ id: serviceRecords.id })
      .from(serviceRecords)
      .where(
        and(
          eq(serviceRecords.customerId, customerId),
          eq(serviceRecords.merchantId, draft.merchantId),
          eq(serviceRecords.type, 'STAFF_ORDER'),
          sql`${serviceRecords.meta} ->> 'draftId' = ${draft.id}`,
        ),
      )
      .limit(1);
    if (!scan) throw new BusinessError('draft_not_scanned', '请先扫导购出示的订单码');
    const risk = await this.attribution.buyerRisk(tx, customerId, draft.merchantId, draft.guideId);
    return attributeStaffOrder({
      guideId: draft.guideId,
      storeId: draft.storeId,
      staffOrderRecordId: scan.id,
      ...risk,
    });
  }

  /** 导购开单（PRD 3.2）：生成草稿和订单码，顾客扫码后自己付款。 */
  async createDraft(
    guideId: string,
    lines: DraftLine[],
  ): Promise<{ draftId: string; expiresAt: Date; subtotalCents: number } & IssuedCode> {
    const [guide] = await this.db.select().from(guides).where(eq(guides.id, guideId));
    if (!guide || guide.status !== 'active') throw new NotFoundError('导购', 'guide_not_found');
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.config.orderCodeTtlMinutes * 60_000);

    return this.db.transaction(async (tx) => {
      // 开单时就校验商品，避免顾客扫码后才发现商品已下架
      const priced = await this.catalog.priceLines(tx, guide.merchantId, lines);
      const draftId = newId('dr');
      await tx.insert(orderDrafts).values({
        id: draftId,
        merchantId: guide.merchantId,
        storeId: guide.storeId,
        guideId,
        lines,
        createdAt: now,
        expiresAt,
      });
      const code = await this.codes.createOrderCode(tx, {
        id: draftId,
        merchantId: guide.merchantId,
        storeId: guide.storeId,
        guideId,
        expiresAt,
      });
      return {
        draftId,
        expiresAt,
        subtotalCents: priced.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0),
        ...code,
      };
    });
  }

  async listForCustomer(customerId: string): Promise<OrderRow[]> {
    return this.db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(sql`${orders.createdAt} desc`);
  }
}

function couponMessage(reason: string): string {
  const messages: Record<string, string> = {
    wrong_customer: '这张券不属于你',
    wrong_merchant: '这张券不能在这个商家使用',
    not_usable: '这张券已使用或已作废',
    expired: '这张券已过期',
    not_yet_valid: '这张券还未生效',
    not_stackable: '这张券不能与平台活动同时使用',
    no_eligible_items: '订单里没有这张券适用的商品',
    below_threshold: '未达到这张券的使用门槛',
  };
  return messages[reason] ?? '这张券不能使用';
}
