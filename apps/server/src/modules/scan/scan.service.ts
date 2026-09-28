import {
  describeDiscount,
  isBindingEffective,
  needsAutoAssign,
  parseQrToken,
  pickAutoAssignee,
  verifyCardScan,
  type Binding,
  type BindingChange,
  type LatLng,
} from '@codeshop/domain';
import { Inject, Injectable } from '@nestjs/common';
import { and, arrayContains, count, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { Clock } from '../../common/clock';
import { BusinessError, NotFoundError } from '../../common/errors';
import { DB, lockCustomerMerchant, type Db, type Tx } from '../../db/database';
import { bindings, guides, merchants, orderDrafts, stores } from '../../db/schema';
import { AttributionService } from '../attribution/attribution.service';
import { CatalogService, type ProductView } from '../catalog/catalog.service';
import { CodesService } from '../codes/codes.service';
import { CouponsService, type CouponRow } from '../coupons/coupons.service';
import { MerchantRulesService } from '../rules/merchant-rules.service';

export interface ScanInput {
  token: string;
  /** 顾客位置（GCJ-02），扫实体导购卡时必填 */
  location?: (LatLng & { accuracy?: number | null }) | null;
}

interface Named {
  id: string;
  name: string;
}

export interface BindingView {
  guide: Named;
  storeId: string;
  strength: 'strong' | 'weak';
  expiresAt: Date;
}

export interface CouponView {
  id: string;
  merchantId: string;
  guideId: string;
  description: string;
  discount: CouponRow['discount'];
  scope: CouponRow['scope'];
  expiresAt: Date;
}

export type ScanResult =
  | {
      kind: 'product';
      merchant: Named;
      store: Named;
      product: ProductView;
      binding: BindingView | null;
      autoAssign: 'call_response' | 'zone' | 'lead_pool' | 'not_needed';
      /** 未强绑定导购时的领券引导，例如「找导购扫码可享 9 折」 */
      couponHint: string | null;
    }
  | {
      kind: 'guide';
      merchant: Named;
      store: Named;
      guide: Named;
      binding: BindingView | null;
      bindingChange: BindingChange;
      bindingRejectedReason: string | null;
      coupon: CouponView | null;
      couponBlocked: { reason: string; retryAt?: Date } | null;
    }
  | {
      kind: 'order';
      merchant: Named;
      store: Named;
      guide: Named;
      draft: {
        id: string;
        expiresAt: Date;
        lines: Array<{ skuId: string; name: string; color: string; size: string; unitPriceCents: number; quantity: number }>;
        subtotalCents: number;
      };
      binding: BindingView | null;
      usableCoupons: CouponView[];
    };

export function couponView(row: CouponRow): CouponView {
  return {
    id: row.id,
    merchantId: row.merchantId,
    guideId: row.guideId,
    description: describeDiscount(row.discount),
    discount: row.discount,
    scope: row.scope,
    expiresAt: row.expiresAt,
  };
}

/**
 * 扫码入口（PRD 3.1）：商品码、导购动态码、实体导购卡、订单码。
 * 同一顾客在同一商家的扫码串行处理（advisory lock），服务记录、绑定、发券在同一事务里完成。
 */
@Injectable()
export class ScanService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
    private readonly codes: CodesService,
    private readonly catalog: CatalogService,
    private readonly attribution: AttributionService,
    private readonly coupons: CouponsService,
    private readonly rules: MerchantRulesService,
  ) {}

  async scan(customerId: string, input: ScanInput): Promise<ScanResult> {
    const parsed = parseQrToken(input.token);
    if (!parsed) throw new BusinessError('invalid_code', '不是本平台的二维码');

    switch (parsed.kind) {
      case 'product':
        return this.scanProduct(customerId, parsed.codeId);
      case 'guide': {
        const verified = this.codes.verifyGuideToken(parsed.token);
        if (!verified.ok) {
          const expired = verified.reason === 'expired';
          throw new BusinessError(
            expired ? 'guide_code_expired' : 'invalid_code',
            expired ? '导购码已过期，请让导购刷新后再扫' : '导购码无效',
          );
        }
        return this.scanGuide(customerId, verified.guideId, 'GUIDE_CODE_SCAN');
      }
      case 'card': {
        const code = await this.codes.findActive(this.db, parsed.codeId, 'card');
        if (!code.guideId) throw new NotFoundError('导购卡', 'code_not_found');
        return this.scanGuide(customerId, code.guideId, 'GUIDE_CARD_SCAN', input.location ?? null);
      }
      case 'order':
        return this.scanOrder(customerId, parsed.codeId);
    }
  }

  // ——— 商品码 ———

  private async scanProduct(customerId: string, codeId: string): Promise<ScanResult> {
    const code = await this.codes.findActive(this.db, codeId, 'product');
    const { merchant, store } = await this.merchantAndStore(code.merchantId, code.storeId);
    const product = await this.catalog.productAtStore(code.merchantId, code.storeId, code.spuId!);
    const now = this.clock.now();

    return this.db.transaction(async (tx) => {
      await lockCustomerMerchant(tx, customerId, code.merchantId);
      const touch = await this.attribution.recordTouch(tx, {
        customerId,
        merchantId: code.merchantId,
        storeId: code.storeId,
        guideId: null,
        type: 'PRODUCT_SCAN',
        spuId: code.spuId,
        meta: { codeId: code.id },
        at: now,
      });

      let binding = touch.decision.binding;
      let autoAssign: 'call_response' | 'zone' | 'lead_pool' | 'not_needed' = 'not_needed';
      if (needsAutoAssign(binding, code.storeId, now)) {
        const picked = pickAutoAssignee({
          zoneGuides: await this.zoneCandidates(tx, customerId, code.storeId, code.zone, now),
        });
        autoAssign = picked.source;
        if (picked.guideId) {
          const assigned = await this.attribution.recordTouch(tx, {
            customerId,
            merchantId: code.merchantId,
            storeId: code.storeId,
            guideId: picked.guideId,
            type: 'AUTO_ASSIGN',
            spuId: code.spuId,
            meta: { zone: code.zone },
            at: now,
          });
          binding = assigned.decision.binding;
        }
      }

      const { guideCoupon } = await this.rules.get(code.merchantId, tx);
      const strongBound = isBindingEffective(binding, now) && binding.strength === 'strong';
      return {
        kind: 'product',
        merchant,
        store,
        product,
        binding: await this.bindingView(tx, binding, now),
        autoAssign,
        couponHint:
          guideCoupon.enabled && !strongBound ? `找导购扫码可享 ${describeDiscount(guideCoupon.discount)}` : null,
      };
    });
  }

  /** 商品所在陈列区的当班责任导购（不含顾客本人），附带各自当前的有效绑定数。 */
  private async zoneCandidates(tx: Tx, customerId: string, storeId: string, zone: string | null, now: Date) {
    if (!zone) return [];
    const onDuty = await tx
      .select({ id: guides.id })
      .from(guides)
      .where(
        and(
          eq(guides.storeId, storeId),
          eq(guides.status, 'active'),
          eq(guides.onDuty, true),
          arrayContains(guides.zones, [zone]),
          or(isNull(guides.customerId), ne(guides.customerId, customerId)),
        ),
      );
    if (onDuty.length === 0) return [];
    const loads = await tx
      .select({ guideId: bindings.guideId, n: count() })
      .from(bindings)
      .where(and(inArray(bindings.guideId, onDuty.map((g) => g.id)), gt(bindings.expiresAt, now)))
      .groupBy(bindings.guideId);
    const loadByGuide = new Map(loads.map((l) => [l.guideId, Number(l.n)]));
    return onDuty.map((g) => ({ guideId: g.id, activeBindingCount: loadByGuide.get(g.id) ?? 0 }));
  }

  // ——— 导购码 / 实体导购卡 ———

  private async scanGuide(
    customerId: string,
    guideId: string,
    type: 'GUIDE_CODE_SCAN' | 'GUIDE_CARD_SCAN',
    location: ScanInput['location'] = null,
  ): Promise<ScanResult> {
    const [guide] = await this.db.select().from(guides).where(eq(guides.id, guideId));
    if (!guide || guide.status !== 'active') throw new NotFoundError('导购', 'guide_not_found');
    const { merchant, store, storeLocation } = await this.merchantAndStore(guide.merchantId, guide.storeId);
    const rules = await this.rules.get(guide.merchantId);

    if (type === 'GUIDE_CARD_SCAN') {
      // 实体卡只在扫码这一刻校验一次位置；失败则不绑定、不发券（PRD 4.2）
      const check = verifyCardScan({
        customerLocation: location ? { lat: location.lat, lng: location.lng } : null,
        accuracyMeters: location?.accuracy ?? null,
        storeLocation,
        radiusMeters: rules.guideCoupon.cardGeofenceMeters,
      });
      if (!check.ok) {
        const messages: Record<typeof check.reason, string> = {
          location_required: '请允许获取位置后再扫导购卡',
          location_inaccurate: '当前定位不够准确，请稍后重试或让导购出示动态码',
          out_of_range: '需要在门店内扫导购卡',
          store_location_missing: '门店尚未设置位置，请让导购出示动态码',
        };
        throw new BusinessError(`card_${check.reason}`, messages[check.reason], {
          distanceMeters: check.distanceMeters,
          radiusMeters: rules.guideCoupon.cardGeofenceMeters,
        });
      }
    }

    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      await lockCustomerMerchant(tx, customerId, guide.merchantId);
      const { record, decision } = await this.attribution.recordTouch(
        tx,
        { customerId, merchantId: guide.merchantId, storeId: guide.storeId, guideId, type, at: now },
        { guideCustomerId: guide.customerId },
      );

      let coupon: CouponView | null = null;
      let couponBlocked: { reason: string; retryAt?: Date } | null = null;
      if (decision.change === 'rejected') {
        // 绑定没有落到这位导购身上时不发券，避免「券是 A 发的、订单归 B」
        couponBlocked = { reason: decision.reason === 'self_binding' ? 'self_scan' : 'binding_not_changed' };
      } else {
        const outcome = await this.coupons.issueForGuideScan(tx, {
          rules: rules.guideCoupon,
          customerId,
          merchantId: guide.merchantId,
          guideId,
          storeId: guide.storeId,
          guideCustomerId: guide.customerId,
          recordId: record.id,
          now,
        });
        if (outcome.issued) coupon = couponView(outcome.coupon);
        else couponBlocked = { reason: outcome.reason, ...(outcome.retryAt ? { retryAt: outcome.retryAt } : {}) };
      }

      return {
        kind: 'guide',
        merchant,
        store,
        guide: { id: guide.id, name: guide.name },
        binding: await this.bindingView(tx, decision.binding, now),
        bindingChange: decision.change,
        bindingRejectedReason: decision.reason ?? null,
        coupon,
        couponBlocked,
      };
    });
  }

  // ——— 订单码 ———

  private async scanOrder(customerId: string, codeId: string): Promise<ScanResult> {
    const code = await this.codes.findActive(this.db, codeId, 'order');
    const now = this.clock.now();
    const [draft] = await this.db.select().from(orderDrafts).where(eq(orderDrafts.id, code.orderDraftId!));
    if (!draft || draft.status !== 'open' || draft.expiresAt.getTime() <= now.getTime()) {
      throw new NotFoundError('订单码', 'order_code_expired');
    }
    const [guide] = await this.db.select().from(guides).where(eq(guides.id, draft.guideId));
    if (!guide) throw new NotFoundError('导购', 'guide_not_found');
    const { merchant, store } = await this.merchantAndStore(draft.merchantId, draft.storeId);

    return this.db.transaction(async (tx) => {
      await lockCustomerMerchant(tx, customerId, draft.merchantId);
      const lines = await this.catalog.priceLines(tx, draft.merchantId, draft.lines);
      const { decision } = await this.attribution.recordTouch(
        tx,
        {
          customerId,
          merchantId: draft.merchantId,
          storeId: draft.storeId,
          guideId: draft.guideId,
          type: 'STAFF_ORDER',
          meta: { draftId: draft.id, codeId: code.id },
          at: now,
        },
        { guideCustomerId: guide.customerId },
      );
      const usable = await this.coupons.listUsable(customerId, draft.merchantId, now, tx);
      return {
        kind: 'order',
        merchant,
        store,
        guide: { id: guide.id, name: guide.name },
        draft: {
          id: draft.id,
          expiresAt: draft.expiresAt,
          lines: lines.map(({ skuId, name, color, size, unitPriceCents, quantity }) => ({
            skuId,
            name,
            color,
            size,
            unitPriceCents,
            quantity,
          })),
          subtotalCents: lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0),
        },
        binding: await this.bindingView(tx, decision.binding, now),
        usableCoupons: usable.map(couponView),
      };
    });
  }

  // ——— 公共 ———

  private async merchantAndStore(merchantId: string, storeId: string) {
    const [row] = await this.db
      .select({
        merchantId: merchants.id,
        merchantName: merchants.name,
        merchantStatus: merchants.status,
        storeId: stores.id,
        storeName: stores.name,
        storeStatus: stores.status,
        lat: stores.lat,
        lng: stores.lng,
      })
      .from(stores)
      .innerJoin(merchants, eq(merchants.id, stores.merchantId))
      .where(and(eq(stores.id, storeId), eq(stores.merchantId, merchantId)));
    if (!row || row.merchantStatus !== 'active' || row.storeStatus !== 'open') {
      throw new NotFoundError('门店', 'store_unavailable');
    }
    return {
      merchant: { id: row.merchantId, name: row.merchantName },
      store: { id: row.storeId, name: row.storeName },
      storeLocation: row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null,
    };
  }

  private async bindingView(tx: Tx, binding: Binding | null, now: Date): Promise<BindingView | null> {
    if (!isBindingEffective(binding, now)) return null;
    const [guide] = await tx.select({ id: guides.id, name: guides.name }).from(guides).where(eq(guides.id, binding.guideId));
    return {
      guide: guide ?? { id: binding.guideId, name: '' },
      storeId: binding.storeId,
      strength: binding.strength,
      expiresAt: binding.expiresAt,
    };
  }
}
