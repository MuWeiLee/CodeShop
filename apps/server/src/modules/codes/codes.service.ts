import { buildQrUrl, formatStaticToken, generateCodeId, type StaticCodeKind } from '@codeshop/domain';
import { signGuideToken, verifyGuideToken, type GuideTokenVerification } from '@codeshop/domain/server';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { Clock } from '../../common/clock';
import { BusinessError, NotFoundError } from '../../common/errors';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { DB, type Db, type DbOrTx, type Tx } from '../../db/database';
import { codes, guides, spus, stores } from '../../db/schema';

export type CodeRow = typeof codes.$inferSelect;

export interface IssuedCode {
  codeId: string;
  token: string;
  qrUrl: string;
}

/** 码服务：生成、解析、作废各类二维码。 */
@Injectable()
export class CodesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  private present(kind: StaticCodeKind, codeId: string): IssuedCode {
    const token = formatStaticToken(kind, codeId);
    return { codeId, token, qrUrl: buildQrUrl(this.config.qrBaseUrl, token) };
  }

  /** 按 ID 查一个有效的静态码。已作废、已过期或类型不符都视为不存在。 */
  async findActive(tx: DbOrTx, codeId: string, kind: StaticCodeKind): Promise<CodeRow> {
    const [row] = await tx
      .select()
      .from(codes)
      .where(and(eq(codes.id, codeId), eq(codes.kind, kind), eq(codes.status, 'active')));
    if (!row || (row.expiresAt && row.expiresAt.getTime() <= this.clock.now().getTime())) {
      throw new NotFoundError('二维码', 'code_not_found');
    }
    return row;
  }

  /**
   * 为门店批量生成商品码（商家端「生码」）。同一家店同一款已有有效码时直接返回原码，重复调用不会产生新码。
   */
  async ensureProductCodes(
    merchantId: string,
    storeId: string,
    spuIds: string[],
    zone: string | null,
  ): Promise<Array<IssuedCode & { spuId: string }>> {
    const [store] = await this.db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, storeId), eq(stores.merchantId, merchantId)));
    if (!store) throw new NotFoundError('门店');

    const uniqueSpuIds = [...new Set(spuIds)];
    const owned = await this.db
      .select({ id: spus.id })
      .from(spus)
      .where(and(eq(spus.merchantId, merchantId), inArray(spus.id, uniqueSpuIds)));
    const ownedIds = new Set(owned.map((s) => s.id));
    const foreign = uniqueSpuIds.filter((id) => !ownedIds.has(id));
    if (foreign.length > 0) throw new BusinessError('spu_not_found', '部分商品不存在或不属于本商家', foreign);

    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(codes)
        .where(
          and(
            eq(codes.storeId, storeId),
            eq(codes.kind, 'product'),
            eq(codes.status, 'active'),
            inArray(codes.spuId, uniqueSpuIds),
          ),
        );
      const bySpu = new Map(existing.map((c) => [c.spuId, c]));
      const result: Array<IssuedCode & { spuId: string }> = [];
      for (const spuId of uniqueSpuIds) {
        let row = bySpu.get(spuId);
        if (!row) {
          [row] = await tx
            .insert(codes)
            .values({ id: generateCodeId(), kind: 'product', merchantId, storeId, spuId, zone })
            .returning();
        }
        result.push({ spuId, ...this.present('product', row!.id) });
      }
      return result;
    });
  }

  /** 导购端「我的码」：当前时间窗口的动态码。 */
  async guideDynamicCode(guideId: string): Promise<{ token: string; qrUrl: string; refreshAt: Date }> {
    const [guide] = await this.db
      .select({ id: guides.id, status: guides.status })
      .from(guides)
      .where(eq(guides.id, guideId));
    if (!guide || guide.status !== 'active') throw new NotFoundError('导购');
    const { token, refreshAt } = signGuideToken(guideId, this.clock.now(), { secret: this.config.guideCodeSecret });
    return { token, qrUrl: buildQrUrl(this.config.qrBaseUrl, token), refreshAt };
  }

  verifyGuideToken(token: string): GuideTokenVerification {
    return verifyGuideToken(token, this.clock.now(), { secret: this.config.guideCodeSecret });
  }

  /** 导购开单后生成订单码，与开单草稿同时过期。 */
  async createOrderCode(
    tx: Tx,
    draft: { id: string; merchantId: string; storeId: string; guideId: string; expiresAt: Date },
  ): Promise<IssuedCode> {
    const [row] = await tx
      .insert(codes)
      .values({
        id: generateCodeId(),
        kind: 'order',
        merchantId: draft.merchantId,
        storeId: draft.storeId,
        guideId: draft.guideId,
        orderDraftId: draft.id,
        expiresAt: draft.expiresAt,
      })
      .returning();
    return this.present('order', row!.id);
  }

  async voidOrderCodes(tx: Tx, draftId: string): Promise<void> {
    await tx.update(codes).set({ status: 'void' }).where(and(eq(codes.kind, 'order'), eq(codes.orderDraftId, draftId)));
  }
}
