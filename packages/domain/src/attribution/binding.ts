import type { AttributionRules } from '../rules.js';
import { addDays, laterOf } from '../time.js';
import type {
  Binding,
  BindingDecision,
  BindingRejectReason,
  BindingStrength,
  ServiceRecord,
  ServiceRecordType,
} from './types.js';

const STRONG_SOURCES: ReadonlySet<ServiceRecordType> = new Set([
  'GUIDE_CODE_SCAN',
  'GUIDE_CARD_SCAN',
  'STAFF_ORDER',
  'APPOINTMENT_RECEPTION',
]);

const WEAK_SOURCES: ReadonlySet<ServiceRecordType> = new Set(['AUTO_ASSIGN', 'CALL_RESPONSE', 'LEAD_CLAIM']);

/** 这类服务记录会带来哪种绑定；不带来绑定的返回 null。 */
export function bindingStrengthOf(type: ServiceRecordType): BindingStrength | null {
  if (STRONG_SOURCES.has(type)) return 'strong';
  if (WEAK_SOURCES.has(type)) return 'weak';
  return null;
}

export function isBindingEffective(binding: Binding | null | undefined, at: Date): binding is Binding {
  return !!binding && binding.expiresAt.getTime() > at.getTime();
}

function expiryFor(strength: BindingStrength, at: Date, rules: AttributionRules): Date {
  return addDays(at, strength === 'strong' ? rules.strongBindingDays : rules.weakBindingDays);
}

export interface BindingContext {
  /** 本条记录中导购本人的顾客账号（如有）。用来阻止导购绑定自己。 */
  guideCustomerId?: string | null;
}

/**
 * 根据一条新的服务记录，计算顾客在该商家内的绑定变化（PRD 4.1）。
 *
 * 覆盖规则：
 * - 强覆盖弱；
 * - 强覆盖强，以后扫为准；商家开启 lockStrongBinding 时，强绑定有效期内不可被覆盖；
 * - 弱覆盖弱，以最近到店为准；
 * - 弱不能覆盖强。
 * 同一导购的新接触只续期（弱遇强则升级为强）。已过期的绑定视为不存在。
 *
 * 纯函数：不读写数据库，调用方负责持久化返回的 binding。
 */
export function nextBinding(
  current: Binding | null,
  record: ServiceRecord,
  rules: AttributionRules,
  ctx: BindingContext = {},
): BindingDecision {
  if (current && (current.customerId !== record.customerId || current.merchantId !== record.merchantId)) {
    throw new Error('绑定与服务记录不属于同一个「顾客 × 商家」');
  }

  const effective = isBindingEffective(current, record.at) ? current : null;
  const keep = (): BindingDecision => ({ binding: effective, change: 'unchanged', previous: effective });
  const reject = (reason: BindingRejectReason): BindingDecision => ({
    binding: effective,
    change: 'rejected',
    reason,
    previous: effective,
  });
  const renew = (b: Binding, patch: Partial<Binding> = {}): BindingDecision => {
    const strength = patch.strength ?? b.strength;
    const updated: Binding = {
      ...b,
      ...patch,
      strength,
      expiresAt: laterOf(b.expiresAt, expiryFor(strength, record.at, rules)),
      lastRecordId: record.id,
    };
    const upgraded = b.strength === 'weak' && strength === 'strong';
    return { binding: updated, change: upgraded ? 'upgraded' : 'renewed', previous: effective };
  };
  const fresh = (strength: BindingStrength, guideId: string, storeId: string): Binding => ({
    customerId: record.customerId,
    merchantId: record.merchantId,
    guideId,
    storeId,
    strength,
    since: record.at,
    expiresAt: expiryFor(strength, record.at, rules),
    sourceRecordId: record.id,
    lastRecordId: record.id,
  });

  switch (record.type) {
    case 'PRODUCT_SCAN':
      // 回到绑定导购所在门店，视为关系仍活跃，续期；去了别的门店不改变绑定
      // （是否需要在新门店自动分配，由 needsAutoAssign 判断）
      return effective && record.storeId === effective.storeId ? renew(effective) : keep();

    case 'FOLLOW_UP':
      return effective && record.guideId === effective.guideId ? renew(effective) : keep();

    case 'TRANSFER': {
      if (!effective) return reject('no_binding_to_transfer');
      if (!record.guideId || !record.storeId) return reject('missing_guide');
      if (ctx.guideCustomerId && ctx.guideCustomerId === record.customerId) return reject('self_binding');
      // 转移保留原绑定强度，由新导购接手并重新计时
      return {
        binding: fresh(effective.strength, record.guideId, record.storeId),
        change: 'replaced',
        previous: effective,
      };
    }
  }

  const offered = bindingStrengthOf(record.type);
  if (!offered) return keep();
  if (!record.guideId || !record.storeId) return reject('missing_guide');
  if (ctx.guideCustomerId && ctx.guideCustomerId === record.customerId) return reject('self_binding');

  if (!effective) {
    return { binding: fresh(offered, record.guideId, record.storeId), change: 'created', previous: null };
  }

  if (effective.guideId === record.guideId) {
    const strength = effective.strength === 'strong' || offered === 'strong' ? 'strong' : 'weak';
    const patch: Partial<Binding> = { strength, storeId: record.storeId };
    if (strength !== effective.strength) patch.sourceRecordId = record.id;
    return renew(effective, patch);
  }

  if (offered === 'strong') {
    if (effective.strength === 'strong' && rules.lockStrongBinding) return reject('strong_binding_locked');
    return { binding: fresh('strong', record.guideId, record.storeId), change: 'replaced', previous: effective };
  }

  if (effective.strength === 'strong') return reject('weak_cannot_override_strong');
  return { binding: fresh('weak', record.guideId, record.storeId), change: 'replaced', previous: effective };
}

/**
 * 顾客自扫商品码后，是否需要在这家门店自动分配导购：
 * 没有有效绑定，或者只有别家门店的弱绑定（弱覆盖弱，以最近到店为准）。
 */
export function needsAutoAssign(current: Binding | null, storeId: string, at: Date): boolean {
  if (!isBindingEffective(current, at)) return true;
  return current.strength === 'weak' && current.storeId !== storeId;
}
