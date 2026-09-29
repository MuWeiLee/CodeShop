import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ActorId, AuthGuard, RequireRole } from '../../common/auth';
import { ZodPipe } from '../../common/zod-pipe';
import { DB, type Db } from '../../db/database';
import { spus, stores } from '../../db/schema';
import { CodesService } from '../codes/codes.service';
import { MerchantRulesService } from '../rules/merchant-rules.service';

const ProductCodesBody = z.object({
  spuIds: z.array(z.string().min(1).max(64)).min(1).max(500),
  zone: z.string().min(1).max(32).nullish(),
});

const discountSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('percent'), percentOff: z.number(), maxOffCents: z.number().nullish() }),
  z.object({ kind: z.literal('threshold'), thresholdCents: z.number(), offCents: z.number() }),
]);

// 这里只校验结构，数值范围由领域规则 validate* 统一校验
const SettingsBody = z.object({
  attribution: z
    .object({
      strongBindingDays: z.number(),
      weakBindingDays: z.number(),
      storeWindowDays: z.number(),
      lockStrongBinding: z.boolean(),
    })
    .partial()
    .optional(),
  guideCoupon: z
    .object({
      enabled: z.boolean(),
      discount: discountSchema,
      validDays: z.number(),
      cooldownDays: z.number(),
      scope: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('all') }),
        z.object({ kind: z.literal('spus'), spuIds: z.array(z.string()) }),
      ]),
      stackWithPlatform: z.boolean(),
      cardGeofenceMeters: z.number(),
    })
    .partial()
    .optional(),
});

/** 商家端接口（目前覆盖门店与商品列表、生码、规则配置，其余模块见 PRD 第 7 节）。 */
@Controller('merchant')
@UseGuards(AuthGuard)
@RequireRole('merchant')
export class MerchantController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly codes: CodesService,
    private readonly rules: MerchantRulesService,
  ) {}

  @Get('stores')
  async stores(@ActorId() merchantId: string) {
    const items = await this.db
      .select({ id: stores.id, name: stores.name, status: stores.status, lat: stores.lat, lng: stores.lng })
      .from(stores)
      .where(eq(stores.merchantId, merchantId))
      .orderBy(stores.name);
    return { items };
  }

  @Get('spus')
  async spus(@ActorId() merchantId: string) {
    const items = await this.db
      .select({ id: spus.id, name: spus.name, status: spus.status })
      .from(spus)
      .where(eq(spus.merchantId, merchantId))
      .orderBy(spus.name);
    return { items };
  }

  /** 为门店批量生成商品码；已有有效码的款直接返回原码。 */
  @Post('stores/:storeId/product-codes')
  async productCodes(
    @ActorId() merchantId: string,
    @Param('storeId') storeId: string,
    @Body(new ZodPipe(ProductCodesBody)) body: z.infer<typeof ProductCodesBody>,
  ) {
    return { items: await this.codes.ensureProductCodes(merchantId, storeId, body.spuIds, body.zone ?? null) };
  }

  @Get('settings')
  settings(@ActorId() merchantId: string) {
    return this.rules.get(merchantId);
  }

  @Put('settings')
  updateSettings(@ActorId() merchantId: string, @Body(new ZodPipe(SettingsBody)) body: z.infer<typeof SettingsBody>) {
    return this.rules.update(merchantId, body);
  }
}
