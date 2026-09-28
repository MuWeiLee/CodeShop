import {
  attributeOrder,
  IN_STORE_RECORD_TYPES,
  nextBinding,
  type Binding,
  type BindingContext,
  type BindingDecision,
  type OrderAttribution,
  type ServiceRecord,
  type ServiceRecordType,
  type StoreTouch,
} from '@codeshop/domain';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { newId } from '../../common/ids';
import type { DbOrTx, Tx } from '../../db/database';
import { bindings, customers, guides, serviceRecords } from '../../db/schema';
import { MerchantRulesService } from '../rules/merchant-rules.service';

export interface TouchInput {
  customerId: string;
  merchantId: string;
  storeId: string | null;
  guideId: string | null;
  type: ServiceRecordType;
  spuId?: string | null;
  meta?: Record<string, unknown>;
  at: Date;
}

/**
 * 服务记录与归属引擎的持久化部分。规则本身在 @codeshop/domain，这里只负责读写。
 */
@Injectable()
export class AttributionService {
  constructor(private readonly rules: MerchantRulesService) {}

  /**
   * 写入一条服务记录并更新绑定。调用方必须在事务中、并已持有「顾客 × 商家」锁（lockCustomerMerchant）。
   */
  async recordTouch(
    tx: Tx,
    input: TouchInput,
    ctx: BindingContext = {},
  ): Promise<{ record: ServiceRecord; decision: BindingDecision }> {
    const { attribution } = await this.rules.get(input.merchantId, tx);
    const current = await this.loadBinding(tx, input.customerId, input.merchantId);

    const record: ServiceRecord = {
      id: newId('sr'),
      customerId: input.customerId,
      merchantId: input.merchantId,
      storeId: input.storeId,
      guideId: input.guideId,
      type: input.type,
      at: input.at,
    };
    const decision = nextBinding(current, record, attribution, ctx);

    await tx.insert(serviceRecords).values({
      ...record,
      spuId: input.spuId ?? null,
      meta: { ...input.meta, bindingChange: decision.change, ...(decision.reason ? { reason: decision.reason } : {}) },
    });

    const changed = decision.change !== 'unchanged' && decision.change !== 'rejected';
    if (changed && decision.binding) {
      const b = decision.binding;
      const values = {
        guideId: b.guideId,
        storeId: b.storeId,
        strength: b.strength,
        since: b.since,
        expiresAt: b.expiresAt,
        sourceRecordId: b.sourceRecordId,
        lastRecordId: b.lastRecordId,
        updatedAt: input.at,
      };
      await tx
        .insert(bindings)
        .values({ customerId: b.customerId, merchantId: b.merchantId, ...values })
        .onConflictDoUpdate({ target: [bindings.customerId, bindings.merchantId], set: values });
    }
    return { record, decision };
  }

  async loadBinding(tx: DbOrTx, customerId: string, merchantId: string): Promise<Binding | null> {
    const [row] = await tx
      .select()
      .from(bindings)
      .where(and(eq(bindings.customerId, customerId), eq(bindings.merchantId, merchantId)));
    if (!row) return null;
    return {
      customerId: row.customerId,
      merchantId: row.merchantId,
      guideId: row.guideId,
      storeId: row.storeId,
      strength: row.strength,
      since: row.since,
      expiresAt: row.expiresAt,
      sourceRecordId: row.sourceRecordId,
      lastRecordId: row.lastRecordId,
    };
  }

  /** 顾客在该商家内、某时刻之前最近一次到店的服务记录。 */
  async lastStoreTouch(tx: DbOrTx, customerId: string, merchantId: string, at: Date): Promise<StoreTouch | null> {
    const [row] = await tx
      .select({ id: serviceRecords.id, storeId: serviceRecords.storeId, at: serviceRecords.at })
      .from(serviceRecords)
      .where(
        and(
          eq(serviceRecords.customerId, customerId),
          eq(serviceRecords.merchantId, merchantId),
          isNotNull(serviceRecords.storeId),
          inArray(serviceRecords.type, [...IN_STORE_RECORD_TYPES]),
          lte(serviceRecords.at, at),
        ),
      )
      .orderBy(desc(serviceRecords.at))
      .limit(1);
    return row?.storeId ? { storeId: row.storeId, recordId: row.id, at: row.at } : null;
  }

  /** 下单账号是否为该商家员工，或与绑定导购同手机号（防作弊，PRD 4.4）。 */
  async buyerRisk(
    tx: DbOrTx,
    customerId: string,
    merchantId: string,
    guideId: string | null,
  ): Promise<{ buyerIsMerchantStaff: boolean; sharesDeviceOrPhoneWithGuide: boolean }> {
    const [staff] = await tx
      .select({ id: guides.id })
      .from(guides)
      .where(and(eq(guides.merchantId, merchantId), eq(guides.customerId, customerId)))
      .limit(1);

    let sharesPhone = false;
    if (guideId) {
      const [buyer] = await tx.select({ phone: customers.phone }).from(customers).where(eq(customers.id, customerId));
      const [guide] = await tx.select({ phone: guides.phone }).from(guides).where(eq(guides.id, guideId));
      sharesPhone = !!buyer?.phone && buyer.phone === guide?.phone;
    }
    // 同设备需要客户端上报设备指纹，接入小程序后补充
    return { buyerIsMerchantStaff: !!staff, sharesDeviceOrPhoneWithGuide: sharesPhone };
  }

  /** 顾客自助下单时的归属判定（导购开单另见 attributeStaffOrder）。 */
  async attributeSelfOrder(tx: DbOrTx, customerId: string, merchantId: string, at: Date): Promise<OrderAttribution> {
    const { attribution } = await this.rules.get(merchantId, tx);
    const binding = await this.loadBinding(tx, customerId, merchantId);
    let boundGuideActive = true;
    if (binding) {
      const [guide] = await tx.select({ status: guides.status }).from(guides).where(eq(guides.id, binding.guideId));
      boundGuideActive = guide?.status === 'active';
    }
    const risk = await this.buyerRisk(tx, customerId, merchantId, binding?.guideId ?? null);
    return attributeOrder({
      customerId,
      merchantId,
      at,
      binding,
      boundGuideActive,
      lastStoreTouch: await this.lastStoreTouch(tx, customerId, merchantId, at),
      rules: attribution,
      ...risk,
    });
  }
}
