import { describe, expect, it } from 'vitest';
import { attributeOrder, attributeStaffOrder, DEFAULT_ATTRIBUTION_RULES, pickAutoAssignee } from '../src/index.js';
import { at, binding } from './helpers.js';

const rules = DEFAULT_ATTRIBUTION_RULES;
const base = { customerId: 'cust-1', merchantId: 'm-A', rules };

describe('attributeOrder（PRD 4.1 判定顺序）', () => {
  it('有有效绑定 → 归绑定导购及其所在门店', () => {
    const b = binding({ guideId: 'g-1', storeId: 'store-A1', lastRecordId: 'r-last' });
    const result = attributeOrder({
      ...base,
      at: at(3),
      binding: b,
      lastStoreTouch: { storeId: 'store-A2', recordId: 'r-touch', at: at(2) },
    });
    expect(result).toEqual({
      kind: 'guide',
      storeId: 'store-A1',
      guideId: 'g-1',
      basisRecordId: 'r-last',
      commissionEligible: true,
      ineligibleReason: null,
    });
  });

  it('按人归属：离店后很久、绑定仍有效，订单照样算绑定导购', () => {
    const b = binding({ expiresAt: at(30) });
    const result = attributeOrder({
      ...base,
      at: at(25),
      binding: b,
      lastStoreTouch: { storeId: 'store-A1', recordId: 'r-touch', at: at(0) },
    });
    expect(result.kind).toBe('guide');
  });

  it('无绑定、归因窗口内到过店 → 归最后到店门店的门店池', () => {
    const result = attributeOrder({
      ...base,
      at: at(15),
      binding: null,
      lastStoreTouch: { storeId: 'store-A2', recordId: 'r-touch', at: at(0) },
    });
    expect(result).toEqual({
      kind: 'store_pool',
      storeId: 'store-A2',
      guideId: null,
      basisRecordId: 'r-touch',
      commissionEligible: true,
      ineligibleReason: null,
    });
  });

  it('绑定已过期时退回门店窗口判定', () => {
    const result = attributeOrder({
      ...base,
      at: at(20),
      binding: binding({ expiresAt: at(15) }),
      lastStoreTouch: { storeId: 'store-A1', recordId: 'r-touch', at: at(10) },
    });
    expect(result.kind).toBe('store_pool');
  });

  it('超出归因窗口 → 线上自然订单', () => {
    const result = attributeOrder({
      ...base,
      at: at(15, 1),
      binding: null,
      lastStoreTouch: { storeId: 'store-A1', recordId: 'r-touch', at: at(0) },
    });
    expect(result).toEqual({
      kind: 'organic',
      storeId: null,
      guideId: null,
      basisRecordId: null,
      commissionEligible: false,
      ineligibleReason: null,
    });
  });

  it('从未到店 → 线上自然订单', () => {
    expect(attributeOrder({ ...base, at: at(1), binding: null, lastStoreTouch: null }).kind).toBe('organic');
  });

  it('绑定导购已离职且未转移 → 进导购原门店的门店池', () => {
    const result = attributeOrder({
      ...base,
      at: at(3),
      binding: binding({ storeId: 'store-A1' }),
      boundGuideActive: false,
      lastStoreTouch: null,
    });
    expect(result).toMatchObject({ kind: 'store_pool', storeId: 'store-A1', guideId: null });
  });

  it('商家员工本人下单：记录归属但不计佣金', () => {
    const guide = attributeOrder({
      ...base,
      at: at(1),
      binding: binding(),
      lastStoreTouch: null,
      buyerIsMerchantStaff: true,
    });
    expect(guide).toMatchObject({ kind: 'guide', commissionEligible: false, ineligibleReason: 'staff_purchase' });

    const pool = attributeOrder({
      ...base,
      at: at(1),
      binding: null,
      lastStoreTouch: { storeId: 'store-A1', recordId: 'r', at: at(0) },
      buyerIsMerchantStaff: true,
    });
    expect(pool).toMatchObject({ kind: 'store_pool', commissionEligible: false });
  });

  it('与绑定导购同设备或同手机号：不计佣金', () => {
    const result = attributeOrder({
      ...base,
      at: at(1),
      binding: binding(),
      lastStoreTouch: null,
      sharesDeviceOrPhoneWithGuide: true,
    });
    expect(result).toMatchObject({ commissionEligible: false, ineligibleReason: 'shared_device_or_phone' });
  });

  it('绑定属于别的商家时抛错（商家间数据不能串）', () => {
    expect(() =>
      attributeOrder({ ...base, at: at(1), binding: binding({ merchantId: 'm-B' }), lastStoreTouch: null }),
    ).toThrow();
  });
});

describe('attributeStaffOrder（PRD 3.2 导购开单直接归开单导购）', () => {
  it('归开单导购，依据为扫订单码的服务记录', () => {
    expect(attributeStaffOrder({ guideId: 'g-2', storeId: 'store-A1', staffOrderRecordId: 'r-so' })).toEqual({
      kind: 'guide',
      storeId: 'store-A1',
      guideId: 'g-2',
      basisRecordId: 'r-so',
      commissionEligible: true,
      ineligibleReason: null,
    });
  });

  it('员工本人或同设备 / 同手机号下单不计佣金', () => {
    expect(
      attributeStaffOrder({ guideId: 'g', storeId: 's', staffOrderRecordId: 'r', buyerIsMerchantStaff: true }),
    ).toMatchObject({ commissionEligible: false, ineligibleReason: 'staff_purchase' });
    expect(
      attributeStaffOrder({ guideId: 'g', storeId: 's', staffOrderRecordId: 'r', sharesDeviceOrPhoneWithGuide: true }),
    ).toMatchObject({ commissionEligible: false, ineligibleReason: 'shared_device_or_phone' });
  });
});

describe('pickAutoAssignee（PRD 4.1 自动分配顺序）', () => {
  it('响应呼叫的导购优先', () => {
    expect(
      pickAutoAssignee({ callResponderGuideId: 'g-9', zoneGuides: [{ guideId: 'g-1', activeBindingCount: 0 }] }),
    ).toEqual({ guideId: 'g-9', recordType: 'CALL_RESPONSE', source: 'call_response' });
  });

  it('其次是陈列区责任导购，分给当前绑定最少的；平局按 ID', () => {
    expect(
      pickAutoAssignee({
        zoneGuides: [
          { guideId: 'g-3', activeBindingCount: 5 },
          { guideId: 'g-2', activeBindingCount: 1 },
          { guideId: 'g-1', activeBindingCount: 1 },
        ],
      }),
    ).toEqual({ guideId: 'g-1', recordType: 'AUTO_ASSIGN', source: 'zone' });
  });

  it('都没有 → 进线索池', () => {
    expect(pickAutoAssignee({})).toEqual({ guideId: null, recordType: null, source: 'lead_pool' });
    expect(pickAutoAssignee({ zoneGuides: [] }).source).toBe('lead_pool');
  });
});
