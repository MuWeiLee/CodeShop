/**
 * 商家可配置的规则，对应 PRD 第 4 节。默认值即 PRD 中的「推荐默认」。
 */

/** 递归冻结，防止默认规则被某处代码意外改掉后影响所有商家。 */
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export interface AttributionRules {
  /** 强绑定（扫导购码、导购开单、预约接待）有效天数，默认 30。 */
  strongBindingDays: number;
  /** 弱绑定（系统自动分配、响应呼叫、认领线索）有效天数，默认 15。 */
  weakBindingDays: number;
  /** 门店归因窗口：无绑定时，最后一次到店后多少天内的订单归该门店的门店池，默认 15。 */
  storeWindowDays: number;
  /**
   * 强绑定有效期内能否被其他导购覆盖。
   * false（默认）：以后扫为准；true：有效期内锁定，其他导购扫码不改变绑定。
   */
  lockStrongBinding: boolean;
}

export const DEFAULT_ATTRIBUTION_RULES: Readonly<AttributionRules> = deepFreeze<AttributionRules>({
  strongBindingDays: 30,
  weakBindingDays: 15,
  storeWindowDays: 15,
  lockStrongBinding: false,
});

/** 折扣：按比例减（percentOff=10 即九折）或满减。金额单位为分。 */
export type DiscountRule =
  | { kind: 'percent'; percentOff: number; maxOffCents?: number | null }
  | { kind: 'threshold'; thresholdCents: number; offCents: number };

/** 券适用范围：商家全部商品，或指定的款。 */
export type CouponScope = { kind: 'all' } | { kind: 'spus'; spuIds: string[] };

export interface GuideCouponRules {
  enabled: boolean;
  discount: DiscountRule;
  /** 券有效天数，默认 7。 */
  validDays: number;
  /** 每位顾客在同一商家的领取间隔天数，默认 7（即每 7 天限领 1 张）。 */
  cooldownDays: number;
  scope: CouponScope;
  /** 能否与平台活动叠加，默认否。 */
  stackWithPlatform: boolean;
  /** 扫实体导购卡时，顾客与门店的最大距离（米），默认 200。 */
  cardGeofenceMeters: number;
}

export const DEFAULT_GUIDE_COUPON_RULES: Readonly<GuideCouponRules> = deepFreeze<GuideCouponRules>({
  enabled: true,
  discount: { kind: 'percent', percentOff: 10, maxOffCents: null },
  validDays: 7,
  cooldownDays: 7,
  scope: { kind: 'all' },
  stackWithPlatform: false,
  cardGeofenceMeters: 200,
});

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const inRange = (v: unknown, min: number, max: number) => isInt(v) && v >= min && v <= max;

/** 校验归属规则，返回错误列表；空数组表示合法。 */
export function validateAttributionRules(rules: AttributionRules): string[] {
  const errors: string[] = [];
  if (!inRange(rules.strongBindingDays, 1, 365)) errors.push('strongBindingDays 须为 1–365 的整数');
  if (!inRange(rules.weakBindingDays, 1, 365)) errors.push('weakBindingDays 须为 1–365 的整数');
  if (!inRange(rules.storeWindowDays, 1, 365)) errors.push('storeWindowDays 须为 1–365 的整数');
  if (typeof rules.lockStrongBinding !== 'boolean') errors.push('lockStrongBinding 须为布尔值');
  return errors;
}

export function validateDiscountRule(discount: DiscountRule): string[] {
  const errors: string[] = [];
  if (discount.kind === 'percent') {
    if (!inRange(discount.percentOff, 1, 99)) errors.push('percentOff 须为 1–99 的整数');
    if (discount.maxOffCents != null && !inRange(discount.maxOffCents, 1, Number.MAX_SAFE_INTEGER)) {
      errors.push('maxOffCents 须为正整数（分）');
    }
  } else if (discount.kind === 'threshold') {
    if (!inRange(discount.offCents, 1, Number.MAX_SAFE_INTEGER)) errors.push('offCents 须为正整数（分）');
    if (!inRange(discount.thresholdCents, 1, Number.MAX_SAFE_INTEGER)) {
      errors.push('thresholdCents 须为正整数（分）');
    } else if (isInt(discount.offCents) && discount.offCents > discount.thresholdCents) {
      errors.push('满减金额不能大于门槛金额');
    }
  } else {
    errors.push('未知的折扣类型');
  }
  return errors;
}

/** 校验导购券规则，返回错误列表；空数组表示合法。 */
export function validateGuideCouponRules(rules: GuideCouponRules): string[] {
  const errors: string[] = [];
  if (typeof rules.enabled !== 'boolean') errors.push('enabled 须为布尔值');
  errors.push(...validateDiscountRule(rules.discount));
  if (!inRange(rules.validDays, 1, 365)) errors.push('validDays 须为 1–365 的整数');
  if (!inRange(rules.cooldownDays, 0, 365)) errors.push('cooldownDays 须为 0–365 的整数');
  if (rules.scope.kind === 'spus') {
    if (!Array.isArray(rules.scope.spuIds) || rules.scope.spuIds.length === 0) {
      errors.push('指定商品范围时，spuIds 不能为空');
    }
  } else if (rules.scope.kind !== 'all') {
    errors.push('未知的适用范围');
  }
  if (typeof rules.stackWithPlatform !== 'boolean') errors.push('stackWithPlatform 须为布尔值');
  if (!inRange(rules.cardGeofenceMeters, 20, 5000)) errors.push('cardGeofenceMeters 须为 20–5000 的整数');
  return errors;
}
