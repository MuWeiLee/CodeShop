import { describe, expect, it } from 'vitest';
import {
  allocateDiscount,
  applyCoupon,
  checkGuideCouponEligibility,
  DEFAULT_GUIDE_COUPON_RULES,
  issueGuideCoupon,
  subtotalCents,
  type GuideCouponRules,
  type IssuedCoupon,
} from '../src/index.js';
import { at, T0 } from './helpers.js';

const rules = DEFAULT_GUIDE_COUPON_RULES;

function coupon(overrides: Partial<IssuedCoupon> = {}): IssuedCoupon {
  return {
    ...issueGuideCoupon({ rules, customerId: 'cust-1', merchantId: 'm-A', guideId: 'g-1', storeId: 'store-A1', now: T0 }),
    ...overrides,
  };
}

const lines = [
  { spuId: 'spu-coat', unitPriceCents: 59_900, quantity: 1 },
  { spuId: 'spu-tee', unitPriceCents: 9_900, quantity: 2 },
];

describe('checkGuideCouponEligibility', () => {
  const base = { rules, customerId: 'cust-1', lastIssuedAt: null, now: T0 };

  it('首次扫码可以领券', () => {
    expect(checkGuideCouponEligibility(base)).toEqual({ ok: true });
  });

  it('商家关闭导购券', () => {
    expect(checkGuideCouponEligibility({ ...base, rules: { ...rules, enabled: false } })).toEqual({
      ok: false,
      reason: 'disabled',
    });
  });

  it('导购扫自己的码不能领券', () => {
    expect(checkGuideCouponEligibility({ ...base, guideCustomerId: 'cust-1' })).toMatchObject({
      ok: false,
      reason: 'self_scan',
    });
  });

  it('每 7 天限领 1 张，并告知何时可再领', () => {
    const result = checkGuideCouponEligibility({ ...base, lastIssuedAt: T0, now: at(6) });
    expect(result).toEqual({ ok: false, reason: 'cooldown', retryAt: at(7) });
    expect(checkGuideCouponEligibility({ ...base, lastIssuedAt: T0, now: at(7) })).toEqual({ ok: true });
  });

  it('间隔设为 0 时不限制', () => {
    const noCooldown: GuideCouponRules = { ...rules, cooldownDays: 0 };
    expect(checkGuideCouponEligibility({ ...base, rules: noCooldown, lastIssuedAt: T0, now: T0 })).toEqual({
      ok: true,
    });
  });
});

describe('issueGuideCoupon', () => {
  it('有效期 7 天，并快照当时的规则', () => {
    const mutable = structuredClone(rules) as GuideCouponRules;
    const c = issueGuideCoupon({
      rules: mutable,
      customerId: 'cust-1',
      merchantId: 'm-A',
      guideId: 'g-1',
      storeId: 'store-A1',
      now: T0,
    });
    expect(c).toMatchObject({ issuedAt: T0, expiresAt: at(7), status: 'unused', guideId: 'g-1' });
    (mutable.discount as { percentOff: number }).percentOff = 50;
    expect(c.discount).toEqual({ kind: 'percent', percentOff: 10, maxOffCents: null });
  });
});

describe('applyCoupon', () => {
  const base = { customerId: 'cust-1', merchantId: 'm-A', lines, now: at(1) };

  it('默认九折，按比例分摊到每一行', () => {
    const result = applyCoupon({ ...base, coupon: coupon() });
    expect(subtotalCents(lines)).toBe(79_700);
    expect(result).toEqual({
      ok: true,
      eligibleSubtotalCents: 79_700,
      discountCents: 7_970,
      allocations: [5_990, 1_980],
    });
  });

  it('比例折扣向下取整到分，并受封顶限制', () => {
    const odd = [{ spuId: 's', unitPriceCents: 999, quantity: 1 }];
    const r1 = applyCoupon({ ...base, lines: odd, coupon: coupon() });
    expect(r1).toMatchObject({ ok: true, discountCents: 99 });

    const capped = coupon({ discount: { kind: 'percent', percentOff: 10, maxOffCents: 3_000 } });
    expect(applyCoupon({ ...base, coupon: capped })).toMatchObject({ ok: true, discountCents: 3_000 });
  });

  it('满减：达到门槛才能用', () => {
    const c = coupon({ discount: { kind: 'threshold', thresholdCents: 50_000, offCents: 5_000 } });
    expect(applyCoupon({ ...base, coupon: c })).toMatchObject({ ok: true, discountCents: 5_000 });
    expect(applyCoupon({ ...base, lines: [lines[1]!], coupon: c })).toEqual({
      ok: false,
      reason: 'below_threshold',
    });
  });

  it('指定商品范围：只对范围内的行计算和分摊', () => {
    const c = coupon({ scope: { kind: 'spus', spuIds: ['spu-tee'] } });
    expect(applyCoupon({ ...base, coupon: c })).toEqual({
      ok: true,
      eligibleSubtotalCents: 19_800,
      discountCents: 1_980,
      allocations: [0, 1_980],
    });
    const none = coupon({ scope: { kind: 'spus', spuIds: ['spu-other'] } });
    expect(applyCoupon({ ...base, coupon: none })).toEqual({ ok: false, reason: 'no_eligible_items' });
  });

  it('过期、已使用、不属于该顾客或商家时不能用', () => {
    expect(applyCoupon({ ...base, now: at(7), coupon: coupon() })).toEqual({ ok: false, reason: 'expired' });
    expect(applyCoupon({ ...base, coupon: coupon({ status: 'used' }) })).toEqual({ ok: false, reason: 'not_usable' });
    expect(applyCoupon({ ...base, customerId: 'cust-2', coupon: coupon() })).toEqual({
      ok: false,
      reason: 'wrong_customer',
    });
    expect(applyCoupon({ ...base, merchantId: 'm-B', coupon: coupon() })).toEqual({
      ok: false,
      reason: 'wrong_merchant',
    });
  });

  it('默认不与平台活动叠加', () => {
    expect(applyCoupon({ ...base, hasPlatformPromotion: true, coupon: coupon() })).toEqual({
      ok: false,
      reason: 'not_stackable',
    });
    expect(
      applyCoupon({ ...base, hasPlatformPromotion: true, coupon: coupon({ stackWithPlatform: true }) }).ok,
    ).toBe(true);
  });

  it('非法金额或数量直接报错', () => {
    expect(() =>
      applyCoupon({ ...base, lines: [{ spuId: 's', unitPriceCents: 10.5, quantity: 1 }], coupon: coupon() }),
    ).toThrow(RangeError);
    expect(() =>
      applyCoupon({ ...base, lines: [{ spuId: 's', unitPriceCents: 100, quantity: 0 }], coupon: coupon() }),
    ).toThrow(RangeError);
  });
});

describe('allocateDiscount', () => {
  it('合计严格等于优惠金额，且每行不超过该行金额', () => {
    const amounts = [333, 333, 334];
    const result = allocateDiscount(amounts, 100);
    expect(result.reduce((s, x) => s + x, 0)).toBe(100);
    result.forEach((x, i) => expect(x).toBeLessThanOrEqual(amounts[i]!));
    expect(result).toEqual([33, 33, 34]);
  });

  it('大量随机样本下都满足约束', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 500; i++) {
      const amounts = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => Math.floor(rand() * 50_000));
      const total = amounts.reduce((s, a) => s + a, 0);
      const discount = Math.floor(rand() * (total + 1));
      const result = allocateDiscount(amounts, discount);
      expect(result.reduce((s, x) => s + x, 0)).toBe(discount);
      result.forEach((x, idx) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(amounts[idx]!);
      });
    }
  });

  it('优惠大于总额时报错', () => {
    expect(() => allocateDiscount([100], 101)).toThrow(RangeError);
  });
});
