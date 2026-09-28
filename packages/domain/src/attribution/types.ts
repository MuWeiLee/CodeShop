export type BindingStrength = 'strong' | 'weak';

/**
 * 服务记录类型。顾客与门店或导购的每一次接触都记一条服务记录，
 * 它同时是绑定关系变化和订单归属判定的依据。
 */
export const SERVICE_RECORD_TYPES = [
  /** 顾客自扫商品码（到店接触，本身不带导购） */
  'PRODUCT_SCAN',
  /** 顾客扫导购动态码 → 强绑定 */
  'GUIDE_CODE_SCAN',
  /** 顾客扫实体导购卡（已通过定位校验）→ 强绑定 */
  'GUIDE_CARD_SCAN',
  /** 导购开单，顾客扫订单码 → 强绑定 */
  'STAFF_ORDER',
  /** 预约试穿的接待导购 → 强绑定 */
  'APPOINTMENT_RECEPTION',
  /** 导购响应顾客呼叫 → 弱绑定 */
  'CALL_RESPONSE',
  /** 系统按陈列区自动分配 → 弱绑定 */
  'AUTO_ASSIGN',
  /** 导购从线索池认领 → 弱绑定 */
  'LEAD_CLAIM',
  /** 导购跟进（私聊、电话等），只给自己的绑定续期 */
  'FOLLOW_UP',
  /** 店长把顾客转移给其他导购（导购调店或离职） */
  'TRANSFER',
] as const;

export type ServiceRecordType = (typeof SERVICE_RECORD_TYPES)[number];

export interface ServiceRecord {
  id: string;
  customerId: string;
  merchantId: string;
  storeId: string | null;
  guideId: string | null;
  type: ServiceRecordType;
  at: Date;
}

/** 顾客在某个商家内的导购绑定。「顾客 × 商家」唯一。 */
export interface Binding {
  customerId: string;
  merchantId: string;
  guideId: string;
  /** 导购所在门店 */
  storeId: string;
  strength: BindingStrength;
  since: Date;
  expiresAt: Date;
  /** 建立当前绑定（或升级为强绑定）的服务记录 */
  sourceRecordId: string;
  /** 最近一次续期的服务记录 */
  lastRecordId: string;
}

export type BindingChange = 'created' | 'replaced' | 'upgraded' | 'renewed' | 'unchanged' | 'rejected';

export type BindingRejectReason =
  | 'weak_cannot_override_strong'
  | 'strong_binding_locked'
  | 'self_binding'
  | 'missing_guide'
  | 'no_binding_to_transfer';

export interface BindingDecision {
  /** 处理这条记录之后的有效绑定（null 表示无绑定）。 */
  binding: Binding | null;
  change: BindingChange;
  reason?: BindingRejectReason;
  /** 处理前的有效绑定（已过期的视为 null）。 */
  previous: Binding | null;
}
