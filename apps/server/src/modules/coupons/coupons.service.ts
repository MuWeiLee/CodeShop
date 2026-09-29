import {
  applyCoupon,
  checkGuideCouponEligibility,
  issueGuideCoupon,
  type CartLine,
  type CouponApplication,
  type GuideCouponRules,
  type IssuedCoupon,
} from '@codeshop/domain';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt } from 'drizzle-orm';
import { newId } from '../../common/ids';
import { DB, type Db, type DbOrTx, type Tx } from '../../db/database';
import { coupons } from '../../db/schema';

export type CouponRow = typeof coupons.$inferSelect;

export type IssueOutcome =
  | { issued: true; coupon: CouponRow }
  | { issued: false; reason: 'disabled' | 'self_scan' | 'cooldown' | 'binding_not_changed'; retryAt?: Date };

export function toIssuedCoupon(row: CouponRow): IssuedCoupon {
  return {
    customerId: row.customerId,
    merchantId: row.merchantId,
    guideId: row.guideId,
    storeId: row.storeId,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    discount: row.discount,
    scope: row.scope,
    stackWithPlatform: row.stackWithPlatform,
    status: row.status,
  };
}

@Injectable()
export class CouponsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 扫导购码后尝试发券。调用方需在事务中并持有「顾客 × 商家」锁，保证 7 天限领 1 张在并发下成立。
   */
  async issueForGuideScan(
    tx: Tx,
    input: {
      rules: GuideCouponRules;
      customerId: string;
      merchantId: string;
      guideId: string;
      storeId: string;
      guideCustomerId: string | null;
      recordId: string;
      now: Date;
    },
  ): Promise<IssueOutcome> {
    const [last] = await tx
      .select({ issuedAt: coupons.issuedAt })
      .from(coupons)
      .where(and(eq(coupons.customerId, input.customerId), eq(coupons.merchantId, input.merchantId)))
      .orderBy(desc(coupons.issuedAt))
      .limit(1);

    const eligibility = checkGuideCouponEligibility({
      rules: input.rules,
      customerId: input.customerId,
      guideCustomerId: input.guideCustomerId,
      lastIssuedAt: last?.issuedAt ?? null,
      now: input.now,
    });
    if (!eligibility.ok) {
      return eligibility.reason === 'cooldown'
        ? { issued: false, reason: 'cooldown', retryAt: eligibility.retryAt }
        : { issued: false, reason: eligibility.reason };
    }

    const coupon = issueGuideCoupon({ ...input, now: input.now });
    const [row] = await tx
      .insert(coupons)
      .values({ id: newId('cp'), ...coupon, issuedRecordId: input.recordId })
      .returning();
    return { issued: true, coupon: row! };
  }

  async listUsable(customerId: string, merchantId: string | null, now: Date, tx: DbOrTx = this.db): Promise<CouponRow[]> {
    const conditions = [eq(coupons.customerId, customerId), eq(coupons.status, 'unused'), gt(coupons.expiresAt, now)];
    if (merchantId) conditions.push(eq(coupons.merchantId, merchantId));
    return tx
      .select()
      .from(coupons)
      .where(and(...conditions))
      .orderBy(desc(coupons.issuedAt));
  }

  async findForCustomer(tx: DbOrTx, couponId: string, customerId: string): Promise<CouponRow | null> {
    const [row] = await tx
      .select()
      .from(coupons)
      .where(and(eq(coupons.id, couponId), eq(coupons.customerId, customerId)));
    return row ?? null;
  }

  apply(row: CouponRow, input: { customerId: string; merchantId: string; lines: CartLine[]; now: Date }): CouponApplication {
    return applyCoupon({ coupon: toIssuedCoupon(row), ...input, hasPlatformPromotion: false });
  }

  async markUsed(tx: Tx, couponId: string, orderId: string): Promise<void> {
    await tx.update(coupons).set({ status: 'used', usedOrderId: orderId }).where(eq(coupons.id, couponId));
  }
}
