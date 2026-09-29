import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTRIBUTION_RULES,
  DEFAULT_GUIDE_COUPON_RULES,
  describeDiscount,
  formatYuan,
  validateAttributionRules,
  validateGuideCouponRules,
} from '../src/index.js';

describe('规则默认值与校验', () => {
  it('默认值与 PRD 第 4 节一致且合法', () => {
    expect(DEFAULT_ATTRIBUTION_RULES).toEqual({
      strongBindingDays: 30,
      weakBindingDays: 15,
      storeWindowDays: 15,
      lockStrongBinding: false,
    });
    expect(DEFAULT_GUIDE_COUPON_RULES).toMatchObject({
      validDays: 7,
      cooldownDays: 7,
      stackWithPlatform: false,
      cardGeofenceMeters: 200,
    });
    expect(validateAttributionRules(DEFAULT_ATTRIBUTION_RULES)).toEqual([]);
    expect(validateGuideCouponRules(DEFAULT_GUIDE_COUPON_RULES)).toEqual([]);
  });

  it('默认值不可被意外修改', () => {
    expect(() => {
      (DEFAULT_ATTRIBUTION_RULES as { strongBindingDays: number }).strongBindingDays = 1;
    }).toThrow();
  });

  it('拒绝不合理的配置', () => {
    expect(validateAttributionRules({ ...DEFAULT_ATTRIBUTION_RULES, strongBindingDays: 0 })).toHaveLength(1);
    expect(
      validateGuideCouponRules({
        ...DEFAULT_GUIDE_COUPON_RULES,
        discount: { kind: 'threshold', thresholdCents: 1_000, offCents: 2_000 },
        scope: { kind: 'spus', spuIds: [] },
        cardGeofenceMeters: 5,
      }),
    ).toHaveLength(3);
    expect(
      validateGuideCouponRules({
        ...DEFAULT_GUIDE_COUPON_RULES,
        discount: { kind: 'percent', percentOff: 100 },
      }),
    ).toHaveLength(1);
  });
});

describe('formatYuan', () => {
  it('分转元', () => {
    expect(formatYuan(0)).toBe('0.00');
    expect(formatYuan(5)).toBe('0.05');
    expect(formatYuan(12_345)).toBe('123.45');
  });
});

describe('describeDiscount', () => {
  it('比例折扣与满减的中文描述', () => {
    expect(describeDiscount({ kind: 'percent', percentOff: 10 })).toBe('9 折');
    expect(describeDiscount({ kind: 'percent', percentOff: 15 })).toBe('8.5 折');
    expect(describeDiscount({ kind: 'percent', percentOff: 20, maxOffCents: 10_000 })).toBe('8 折，最多减 100 元');
    expect(describeDiscount({ kind: 'threshold', thresholdCents: 50_000, offCents: 5_050 })).toBe(
      '满 500 元减 50.5 元',
    );
  });
});
