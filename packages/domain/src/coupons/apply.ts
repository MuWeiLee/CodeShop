import { assertCents, type Cents } from '../money.js';
import type { CouponScope } from '../rules.js';
import type { CartLine, IssuedCoupon } from './types.js';

export type CouponApplication =
  | {
      ok: true;
      eligibleSubtotalCents: Cents;
      discountCents: Cents;
      /** 每一行分摊到的优惠（分），顺序与传入的 lines 一致，合计等于 discountCents。 */
      allocations: Cents[];
    }
  | {
      ok: false;
      reason:
        | 'wrong_customer'
        | 'wrong_merchant'
        | 'not_usable'
        | 'expired'
        | 'not_yet_valid'
        | 'not_stackable'
        | 'no_eligible_items'
        | 'below_threshold';
    };

export function lineAmountCents(line: CartLine): Cents {
  assertCents(line.unitPriceCents, 'unitPriceCents');
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new RangeError(`quantity 须为正整数，实际为 ${line.quantity}`);
  }
  const amount = line.unitPriceCents * line.quantity;
  assertCents(amount, 'line amount');
  return amount;
}

export function subtotalCents(lines: readonly CartLine[]): Cents {
  return lines.reduce((sum, line) => sum + lineAmountCents(line), 0);
}

function inScope(scope: CouponScope, line: CartLine): boolean {
  return scope.kind === 'all' || scope.spuIds.includes(line.spuId);
}

/**
 * 按金额比例把优惠分摊到各行（最大余数法），合计严格等于 discount，且每行不超过该行金额。
 * 部分退货时按分摊结果计算退款和佣金扣回。
 */
export function allocateDiscount(amounts: readonly Cents[], discount: Cents): Cents[] {
  amounts.forEach((a) => assertCents(a, 'amount'));
  assertCents(discount, 'discount');
  const total = amounts.reduce((s, a) => s + a, 0);
  if (discount > total) throw new RangeError('优惠金额不能大于参与分摊的总金额');
  if (discount === 0 || total === 0) return amounts.map(() => 0);

  const shares = amounts.map((amount, index) => {
    const exact = (amount * discount) / total;
    return { index, base: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = discount - shares.reduce((s, x) => s + x.base, 0);
  const result = shares.map((x) => x.base);
  // 余数大的先补 1 分；余数相同按行序，保证结果稳定
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (left === 0) break;
    const current = result[share.index]!;
    if (current < amounts[share.index]!) {
      result[share.index] = current + 1;
      left -= 1;
    }
  }
  return result;
}

/**
 * 计算导购券在某个商家订单上的优惠（PRD 4.2）。
 * 比例折扣向下取整到分；优惠不会超过可用商品的金额。
 */
export function applyCoupon(input: {
  coupon: IssuedCoupon;
  customerId: string;
  merchantId: string;
  lines: readonly CartLine[];
  now: Date;
  /** 订单是否同时参加了平台活动 */
  hasPlatformPromotion?: boolean;
}): CouponApplication {
  const { coupon, now } = input;
  const amounts = input.lines.map(lineAmountCents);

  if (coupon.customerId !== input.customerId) return { ok: false, reason: 'wrong_customer' };
  if (coupon.merchantId !== input.merchantId) return { ok: false, reason: 'wrong_merchant' };
  if (coupon.status !== 'unused') return { ok: false, reason: 'not_usable' };
  if (now.getTime() < coupon.issuedAt.getTime()) return { ok: false, reason: 'not_yet_valid' };
  if (now.getTime() >= coupon.expiresAt.getTime()) return { ok: false, reason: 'expired' };
  if (input.hasPlatformPromotion && !coupon.stackWithPlatform) return { ok: false, reason: 'not_stackable' };

  const eligibleAmounts = input.lines.map((line, i) => (inScope(coupon.scope, line) ? amounts[i]! : 0));
  const eligibleSubtotal = eligibleAmounts.reduce((s, a) => s + a, 0);
  if (eligibleSubtotal === 0) return { ok: false, reason: 'no_eligible_items' };

  let discount: Cents;
  const rule = coupon.discount;
  if (rule.kind === 'percent') {
    discount = Math.floor((eligibleSubtotal * rule.percentOff) / 100);
    if (rule.maxOffCents != null) discount = Math.min(discount, rule.maxOffCents);
  } else {
    if (eligibleSubtotal < rule.thresholdCents) return { ok: false, reason: 'below_threshold' };
    discount = rule.offCents;
  }
  discount = Math.min(discount, eligibleSubtotal);

  return {
    ok: true,
    eligibleSubtotalCents: eligibleSubtotal,
    discountCents: discount,
    allocations: allocateDiscount(eligibleAmounts, discount),
  };
}
