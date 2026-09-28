export interface ZoneGuideCandidate {
  guideId: string;
  /** 该导购当前的有效绑定数，用来把顾客分给负担较轻的导购。 */
  activeBindingCount: number;
}

export type AutoAssignResult =
  | { guideId: string; recordType: 'CALL_RESPONSE' | 'AUTO_ASSIGN'; source: 'call_response' | 'zone' }
  | { guideId: null; recordType: null; source: 'lead_pool' };

/**
 * 顾客自扫商品码且无绑定时的自动分配顺序（PRD 4.1）：
 * 1. 响应呼叫的导购；
 * 2. 商品所在陈列区的当班责任导购（多人时分给当前绑定最少的，平局按 ID 排序保证结果稳定）；
 * 3. 都没有则进入门店线索池，由当班导购认领。
 */
export function pickAutoAssignee(input: {
  callResponderGuideId?: string | null;
  zoneGuides?: readonly ZoneGuideCandidate[];
}): AutoAssignResult {
  if (input.callResponderGuideId) {
    return { guideId: input.callResponderGuideId, recordType: 'CALL_RESPONSE', source: 'call_response' };
  }
  const candidates = [...(input.zoneGuides ?? [])].sort(
    (a, b) => a.activeBindingCount - b.activeBindingCount || a.guideId.localeCompare(b.guideId),
  );
  const chosen = candidates[0];
  if (chosen) return { guideId: chosen.guideId, recordType: 'AUTO_ASSIGN', source: 'zone' };
  return { guideId: null, recordType: null, source: 'lead_pool' };
}
