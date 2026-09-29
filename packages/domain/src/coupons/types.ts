import type { CouponScope, DiscountRule } from '../rules.js';

export type CouponStatus = 'unused' | 'used' | 'void';

/** 已发放给顾客的导购券。发放时把规则快照进券里，之后商家改规则不影响已发的券。 */
export interface IssuedCoupon {
  customerId: string;
  merchantId: string;
  guideId: string;
  storeId: string;
  issuedAt: Date;
  expiresAt: Date;
  discount: DiscountRule;
  scope: CouponScope;
  stackWithPlatform: boolean;
  status: CouponStatus;
}

export interface CartLine {
  spuId: string;
  skuId?: string;
  /** 单价（分） */
  unitPriceCents: number;
  quantity: number;
}
