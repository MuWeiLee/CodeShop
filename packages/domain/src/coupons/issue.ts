import type { GuideCouponRules } from '../rules.js';
import { addDays } from '../time.js';
import type { IssuedCoupon } from './types.js';

export type CouponEligibility =
  | { ok: true }
  | { ok: false; reason: 'disabled' | 'self_scan' }
  | { ok: false; reason: 'cooldown'; retryAt: Date };

/**
 * 顾客扫导购码后，能否领取导购券（PRD 4.2）。
 * 调用前提：本次扫码的绑定结果不是 rejected——绑定没有落到这位导购身上时不发券，
 * 否则会出现「券是 A 导购发的，订单却归 B 导购」的情况。
 */
export function checkGuideCouponEligibility(input: {
  rules: GuideCouponRules;
  customerId: string;
  /** 导购本人的顾客账号（如有） */
  guideCustomerId?: string | null;
  /** 该顾客在该商家最近一次领券时间 */
  lastIssuedAt: Date | null;
  now: Date;
}): CouponEligibility {
  if (!input.rules.enabled) return { ok: false, reason: 'disabled' };
  if (input.guideCustomerId && input.guideCustomerId === input.customerId) {
    return { ok: false, reason: 'self_scan' };
  }
  if (input.lastIssuedAt) {
    const retryAt = addDays(input.lastIssuedAt, input.rules.cooldownDays);
    if (input.now.getTime() < retryAt.getTime()) return { ok: false, reason: 'cooldown', retryAt };
  }
  return { ok: true };
}

export function issueGuideCoupon(input: {
  rules: GuideCouponRules;
  customerId: string;
  merchantId: string;
  guideId: string;
  storeId: string;
  now: Date;
}): IssuedCoupon {
  const { rules } = input;
  return {
    customerId: input.customerId,
    merchantId: input.merchantId,
    guideId: input.guideId,
    storeId: input.storeId,
    issuedAt: input.now,
    expiresAt: addDays(input.now, rules.validDays),
    // 快照一份，避免与规则对象共享引用
    discount: structuredClone(rules.discount),
    scope: structuredClone(rules.scope),
    stackWithPlatform: rules.stackWithPlatform,
    status: 'unused',
  };
}
