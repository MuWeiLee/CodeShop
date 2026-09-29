import {
  DEFAULT_ATTRIBUTION_RULES,
  DEFAULT_GUIDE_COUPON_RULES,
  validateAttributionRules,
  validateGuideCouponRules,
  type AttributionRules,
  type GuideCouponRules,
} from '@codeshop/domain';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Clock } from '../../common/clock';
import { BusinessError, NotFoundError } from '../../common/errors';
import { DB, type Db, type DbOrTx } from '../../db/database';
import { merchants, merchantSettings } from '../../db/schema';

export interface MerchantRules {
  attribution: AttributionRules;
  guideCoupon: GuideCouponRules;
}

/** 商家规则配置。没有配置过的商家使用 PRD 推荐默认值。 */
@Injectable()
export class MerchantRulesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async get(merchantId: string, tx: DbOrTx = this.db): Promise<MerchantRules> {
    const [row] = await tx.select().from(merchantSettings).where(eq(merchantSettings.merchantId, merchantId));
    return {
      attribution: { ...DEFAULT_ATTRIBUTION_RULES, ...row?.attributionRules },
      guideCoupon: { ...structuredClone(DEFAULT_GUIDE_COUPON_RULES), ...row?.guideCouponRules },
    };
  }

  async update(
    merchantId: string,
    patch: { attribution?: Partial<AttributionRules>; guideCoupon?: Partial<GuideCouponRules> },
  ): Promise<MerchantRules> {
    const [merchant] = await this.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId));
    if (!merchant) throw new NotFoundError('商家');

    const current = await this.get(merchantId);
    const next: MerchantRules = {
      attribution: { ...current.attribution, ...patch.attribution },
      guideCoupon: { ...current.guideCoupon, ...patch.guideCoupon },
    };
    const errors = [...validateAttributionRules(next.attribution), ...validateGuideCouponRules(next.guideCoupon)];
    if (errors.length > 0) throw new BusinessError('invalid_rules', '规则配置不合法', errors);

    await this.db
      .insert(merchantSettings)
      .values({ merchantId, attributionRules: next.attribution, guideCouponRules: next.guideCoupon })
      .onConflictDoUpdate({
        target: merchantSettings.merchantId,
        set: {
          attributionRules: next.attribution,
          guideCouponRules: next.guideCoupon,
          updatedAt: this.clock.now(),
        },
      });
    return next;
  }
}
