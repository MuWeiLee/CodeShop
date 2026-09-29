import type { AttributionRules } from '../rules.js';
import { isWithinDays } from '../time.js';
import { isBindingEffective } from './binding.js';
import type { Binding } from './types.js';

export interface StoreTouch {
  storeId: string;
  recordId: string;
  at: Date;
}

export interface OrderAttributionInput {
  customerId: string;
  merchantId: string;
  /** 下单时间 */
  at: Date;
  /** 顾客在该商家内的绑定（可能已过期） */
  binding: Binding | null;
  /** 绑定导购是否仍在职，默认 true。离职未转移时订单进门店池。 */
  boundGuideActive?: boolean;
  /** 顾客在该商家内最近一次到店的服务记录 */
  lastStoreTouch: StoreTouch | null;
  rules: AttributionRules;
  /** 下单账号是该商家员工本人的账号 */
  buyerIsMerchantStaff?: boolean;
  /** 下单账号与绑定导购同设备或同手机号 */
  sharesDeviceOrPhoneWithGuide?: boolean;
}

export type CommissionIneligibleReason = 'staff_purchase' | 'shared_device_or_phone';

export type OrderAttribution =
  | {
      kind: 'guide';
      storeId: string;
      guideId: string;
      basisRecordId: string;
      commissionEligible: boolean;
      ineligibleReason: CommissionIneligibleReason | null;
    }
  | {
      kind: 'store_pool';
      storeId: string;
      guideId: null;
      basisRecordId: string;
      commissionEligible: boolean;
      ineligibleReason: CommissionIneligibleReason | null;
    }
  | {
      kind: 'organic';
      storeId: null;
      guideId: null;
      basisRecordId: null;
      commissionEligible: false;
      ineligibleReason: null;
    };

/**
 * 下单时判定订单归属（PRD 4.1）：
 * 1. 顾客在该商家内有有效绑定 → 归绑定导购及其所在门店；
 * 2. 没有绑定，但归因窗口内有到店记录 → 归最后到店门店的门店池；
 * 3. 以上都没有 → 线上自然订单。
 *
 * 防作弊（PRD 4.4）：商家员工本人下单、或与绑定导购同设备 / 同手机号的账号下单，照常记录归属，但不计佣金。
 * 每个结果都带 basisRecordId，出现争议时可追溯到具体的服务记录。
 */
export function attributeOrder(input: OrderAttributionInput): OrderAttribution {
  const { binding, at } = input;
  if (binding && (binding.customerId !== input.customerId || binding.merchantId !== input.merchantId)) {
    throw new Error('绑定与订单不属于同一个「顾客 × 商家」');
  }

  const eligibility = (checkGuideLink: boolean) => {
    if (input.buyerIsMerchantStaff) {
      return { commissionEligible: false, ineligibleReason: 'staff_purchase' as const };
    }
    if (checkGuideLink && input.sharesDeviceOrPhoneWithGuide) {
      return { commissionEligible: false, ineligibleReason: 'shared_device_or_phone' as const };
    }
    return { commissionEligible: true, ineligibleReason: null };
  };

  if (isBindingEffective(binding, at)) {
    if (input.boundGuideActive === false) {
      return {
        kind: 'store_pool',
        storeId: binding.storeId,
        guideId: null,
        basisRecordId: binding.lastRecordId,
        ...eligibility(false),
      };
    }
    return {
      kind: 'guide',
      storeId: binding.storeId,
      guideId: binding.guideId,
      basisRecordId: binding.lastRecordId,
      ...eligibility(true),
    };
  }

  const touch = input.lastStoreTouch;
  if (touch && isWithinDays(touch.at, at, input.rules.storeWindowDays)) {
    return {
      kind: 'store_pool',
      storeId: touch.storeId,
      guideId: null,
      basisRecordId: touch.recordId,
      ...eligibility(false),
    };
  }

  return {
    kind: 'organic',
    storeId: null,
    guideId: null,
    basisRecordId: null,
    commissionEligible: false,
    ineligibleReason: null,
  };
}

/**
 * 导购开单的订单：直接归开单导购（PRD 3.2），不受顾客原有绑定影响。
 * basisRecordId 是顾客扫订单码时产生的 STAFF_ORDER 服务记录。
 */
export function attributeStaffOrder(input: {
  guideId: string;
  storeId: string;
  staffOrderRecordId: string;
  buyerIsMerchantStaff?: boolean;
  sharesDeviceOrPhoneWithGuide?: boolean;
}): Extract<OrderAttribution, { kind: 'guide' }> {
  const ineligibleReason: CommissionIneligibleReason | null = input.buyerIsMerchantStaff
    ? 'staff_purchase'
    : input.sharesDeviceOrPhoneWithGuide
      ? 'shared_device_or_phone'
      : null;
  return {
    kind: 'guide',
    storeId: input.storeId,
    guideId: input.guideId,
    basisRecordId: input.staffOrderRecordId,
    commissionEligible: ineligibleReason === null,
    ineligibleReason,
  };
}
