import { describe, expect, it } from 'vitest';
import { DEFAULT_ATTRIBUTION_RULES, nextBinding, needsAutoAssign, bindingStrengthOf } from '../src/index.js';
import { at, binding, record, T0 } from './helpers.js';

const rules = DEFAULT_ATTRIBUTION_RULES;
const locked = { ...DEFAULT_ATTRIBUTION_RULES, lockStrongBinding: true };

describe('bindingStrengthOf', () => {
  it('区分强、弱和不带绑定的服务记录', () => {
    expect(bindingStrengthOf('GUIDE_CODE_SCAN')).toBe('strong');
    expect(bindingStrengthOf('GUIDE_CARD_SCAN')).toBe('strong');
    expect(bindingStrengthOf('STAFF_ORDER')).toBe('strong');
    expect(bindingStrengthOf('APPOINTMENT_RECEPTION')).toBe('strong');
    expect(bindingStrengthOf('AUTO_ASSIGN')).toBe('weak');
    expect(bindingStrengthOf('CALL_RESPONSE')).toBe('weak');
    expect(bindingStrengthOf('LEAD_CLAIM')).toBe('weak');
    expect(bindingStrengthOf('PRODUCT_SCAN')).toBeNull();
    expect(bindingStrengthOf('FOLLOW_UP')).toBeNull();
  });
});

describe('nextBinding：新建', () => {
  it('无绑定时扫导购码 → 创建强绑定，30 天有效', () => {
    const r = record('GUIDE_CODE_SCAN', { guideId: 'g-1' });
    const d = nextBinding(null, r, rules);
    expect(d.change).toBe('created');
    expect(d.binding).toMatchObject({
      guideId: 'g-1',
      storeId: 'store-A1',
      strength: 'strong',
      since: T0,
      expiresAt: at(30),
      sourceRecordId: r.id,
      lastRecordId: r.id,
    });
  });

  it('无绑定时自动分配 → 创建弱绑定，15 天有效', () => {
    const d = nextBinding(null, record('AUTO_ASSIGN', { guideId: 'g-1' }), rules);
    expect(d.change).toBe('created');
    expect(d.binding?.strength).toBe('weak');
    expect(d.binding?.expiresAt).toEqual(at(15));
  });

  it('已过期的绑定视为不存在', () => {
    const expired = binding({ guideId: 'g-1', expiresAt: at(5) });
    const d = nextBinding(expired, record('AUTO_ASSIGN', { guideId: 'g-2', at: at(6) }), rules);
    expect(d.previous).toBeNull();
    expect(d.change).toBe('created');
    expect(d.binding?.guideId).toBe('g-2');
  });

  it('到期那一刻即失效', () => {
    const b = binding({ expiresAt: at(5) });
    const d = nextBinding(b, record('AUTO_ASSIGN', { guideId: 'g-2', at: at(5) }), rules);
    expect(d.change).toBe('created');
  });
});

describe('nextBinding：覆盖规则（PRD 4.1）', () => {
  it('强覆盖弱', () => {
    const weak = binding({ guideId: 'g-1', strength: 'weak', expiresAt: at(15) });
    const d = nextBinding(weak, record('GUIDE_CODE_SCAN', { guideId: 'g-2', at: at(1) }), rules);
    expect(d.change).toBe('replaced');
    expect(d.binding).toMatchObject({ guideId: 'g-2', strength: 'strong', expiresAt: at(31) });
  });

  it('强覆盖强，以后扫为准（默认不锁定）', () => {
    const strong = binding({ guideId: 'g-1' });
    const d = nextBinding(strong, record('GUIDE_CODE_SCAN', { guideId: 'g-2', at: at(2) }), rules);
    expect(d.change).toBe('replaced');
    expect(d.binding?.guideId).toBe('g-2');
    expect(d.previous?.guideId).toBe('g-1');
  });

  it('商家开启锁定后，强绑定有效期内不能被其他导购覆盖', () => {
    const strong = binding({ guideId: 'g-1' });
    const d = nextBinding(strong, record('STAFF_ORDER', { guideId: 'g-2', at: at(2) }), locked);
    expect(d.change).toBe('rejected');
    expect(d.reason).toBe('strong_binding_locked');
    expect(d.binding?.guideId).toBe('g-1');
  });

  it('锁定只在有效期内生效，过期后可以重新绑定', () => {
    const strong = binding({ guideId: 'g-1', expiresAt: at(30) });
    const d = nextBinding(strong, record('GUIDE_CODE_SCAN', { guideId: 'g-2', at: at(31) }), locked);
    expect(d.change).toBe('created');
    expect(d.binding?.guideId).toBe('g-2');
  });

  it('弱覆盖弱，以最近到店为准', () => {
    const weak = binding({ guideId: 'g-1', strength: 'weak', expiresAt: at(15) });
    const d = nextBinding(
      weak,
      record('AUTO_ASSIGN', { guideId: 'g-9', storeId: 'store-A2', at: at(3) }),
      rules,
    );
    expect(d.change).toBe('replaced');
    expect(d.binding).toMatchObject({ guideId: 'g-9', storeId: 'store-A2', strength: 'weak' });
  });

  it('弱不能覆盖强', () => {
    const strong = binding({ guideId: 'g-1' });
    for (const type of ['AUTO_ASSIGN', 'CALL_RESPONSE', 'LEAD_CLAIM'] as const) {
      const d = nextBinding(strong, record(type, { guideId: 'g-2', at: at(1) }), rules);
      expect(d.change).toBe('rejected');
      expect(d.reason).toBe('weak_cannot_override_strong');
      expect(d.binding?.guideId).toBe('g-1');
    }
  });
});

describe('nextBinding：同一导购续期与升级', () => {
  it('同一导购再次扫码 → 续期，不改变建立时间', () => {
    const strong = binding({ guideId: 'g-1', expiresAt: at(30) });
    const r = record('GUIDE_CODE_SCAN', { guideId: 'g-1', at: at(10) });
    const d = nextBinding(strong, r, rules);
    expect(d.change).toBe('renewed');
    expect(d.binding).toMatchObject({ since: T0, expiresAt: at(40), sourceRecordId: 'r-src', lastRecordId: r.id });
  });

  it('续期不会缩短到期时间', () => {
    const strong = binding({ guideId: 'g-1', expiresAt: at(40) });
    const d = nextBinding(strong, record('CALL_RESPONSE', { guideId: 'g-1', at: at(1) }), rules);
    expect(d.change).toBe('renewed');
    expect(d.binding?.strength).toBe('strong');
    expect(d.binding?.expiresAt).toEqual(at(40));
  });

  it('弱绑定的导购被扫导购码 → 升级为强绑定', () => {
    const weak = binding({ guideId: 'g-1', strength: 'weak', expiresAt: at(15) });
    const r = record('GUIDE_CODE_SCAN', { guideId: 'g-1', at: at(2) });
    const d = nextBinding(weak, r, rules);
    expect(d.change).toBe('upgraded');
    expect(d.binding).toMatchObject({ strength: 'strong', expiresAt: at(32), sourceRecordId: r.id });
  });

  it('导购跟进只给自己的绑定续期', () => {
    const b = binding({ guideId: 'g-1', expiresAt: at(30) });
    expect(nextBinding(b, record('FOLLOW_UP', { guideId: 'g-1', at: at(20) }), rules).binding?.expiresAt).toEqual(
      at(50),
    );
    const other = nextBinding(b, record('FOLLOW_UP', { guideId: 'g-2', at: at(20) }), rules);
    expect(other.change).toBe('unchanged');
    expect(other.binding?.guideId).toBe('g-1');
  });

  it('回到绑定导购所在门店扫商品码 → 续期；去别的门店不改变绑定', () => {
    const b = binding({ guideId: 'g-1', storeId: 'store-A1', expiresAt: at(30) });
    const same = nextBinding(b, record('PRODUCT_SCAN', { storeId: 'store-A1', at: at(20) }), rules);
    expect(same.change).toBe('renewed');
    expect(same.binding?.expiresAt).toEqual(at(50));

    const elsewhere = nextBinding(b, record('PRODUCT_SCAN', { storeId: 'store-A2', at: at(20) }), rules);
    expect(elsewhere.change).toBe('unchanged');
    expect(elsewhere.binding?.expiresAt).toEqual(at(30));
  });

  it('无绑定时扫商品码不产生绑定', () => {
    const d = nextBinding(null, record('PRODUCT_SCAN'), rules);
    expect(d).toMatchObject({ binding: null, change: 'unchanged' });
  });
});

describe('nextBinding：转移与异常', () => {
  it('店长转移：保留强度，新导购接手并重新计时', () => {
    const b = binding({ guideId: 'g-1', strength: 'strong', expiresAt: at(30) });
    const r = record('TRANSFER', { guideId: 'g-3', storeId: 'store-A2', at: at(5) });
    const d = nextBinding(b, r, locked);
    expect(d.change).toBe('replaced');
    expect(d.binding).toMatchObject({
      guideId: 'g-3',
      storeId: 'store-A2',
      strength: 'strong',
      since: at(5),
      expiresAt: at(35),
      sourceRecordId: r.id,
    });
  });

  it('没有有效绑定时不能转移', () => {
    const d = nextBinding(null, record('TRANSFER', { guideId: 'g-3' }), rules);
    expect(d).toMatchObject({ change: 'rejected', reason: 'no_binding_to_transfer', binding: null });
  });

  it('导购不能绑定自己', () => {
    const d = nextBinding(null, record('GUIDE_CODE_SCAN', { guideId: 'g-1' }), rules, {
      guideCustomerId: 'cust-1',
    });
    expect(d).toMatchObject({ change: 'rejected', reason: 'self_binding', binding: null });
  });

  it('缺少导购或门店的绑定类记录被拒绝', () => {
    expect(nextBinding(null, record('AUTO_ASSIGN'), rules).reason).toBe('missing_guide');
    expect(nextBinding(null, record('STAFF_ORDER', { guideId: 'g-1', storeId: null }), rules).reason).toBe(
      'missing_guide',
    );
  });

  it('绑定与记录不属于同一「顾客 × 商家」时抛错', () => {
    expect(() => nextBinding(binding(), record('FOLLOW_UP', { merchantId: 'm-B' }), rules)).toThrow();
    expect(() => nextBinding(binding(), record('FOLLOW_UP', { customerId: 'cust-2' }), rules)).toThrow();
  });

  it('不修改传入的绑定对象', () => {
    const b = binding({ guideId: 'g-1', expiresAt: at(30) });
    const snapshot = structuredClone(b);
    nextBinding(b, record('GUIDE_CODE_SCAN', { guideId: 'g-1', at: at(10) }), rules);
    expect(b).toEqual(snapshot);
  });
});

describe('needsAutoAssign', () => {
  it('无绑定或绑定已过期 → 需要分配', () => {
    expect(needsAutoAssign(null, 'store-A1', T0)).toBe(true);
    expect(needsAutoAssign(binding({ expiresAt: at(1) }), 'store-A1', at(2))).toBe(true);
  });

  it('别家门店的弱绑定 → 需要在新门店重新分配', () => {
    const weak = binding({ strength: 'weak', storeId: 'store-A1', expiresAt: at(15) });
    expect(needsAutoAssign(weak, 'store-A2', at(1))).toBe(true);
    expect(needsAutoAssign(weak, 'store-A1', at(1))).toBe(false);
  });

  it('有效的强绑定 → 不分配，哪家门店都一样', () => {
    const strong = binding({ strength: 'strong', storeId: 'store-A1' });
    expect(needsAutoAssign(strong, 'store-A2', at(1))).toBe(false);
  });
});
