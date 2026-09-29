import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { ActorId, AuthGuard, RequireRole } from '../../common/auth';
import { Clock } from '../../common/clock';
import { ZodPipe } from '../../common/zod-pipe';
import { DB, type Db } from '../../db/database';
import { bindings, guides, merchants } from '../../db/schema';
import { CouponsService } from '../coupons/coupons.service';
import { OrdersService } from '../orders/orders.service';
import { couponView, ScanService } from '../scan/scan.service';

const idSchema = z.string().min(1).max(64);

const ScanBody = z.object({
  token: z.string().min(1).max(512),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative().nullish(),
    })
    .nullish(),
});

const OrderBody = z
  .object({
    merchantId: idSchema,
    lines: z
      .array(z.object({ skuId: idSchema, quantity: z.number().int().min(1).max(99) }))
      .max(50)
      .default([]),
    couponId: idSchema.nullish(),
    draftId: idSchema.nullish(),
  })
  .refine((b) => b.draftId || b.lines.length > 0, { message: '请选择商品', path: ['lines'] });

/** 客户端（小程序）接口。 */
@Controller()
@UseGuards(AuthGuard)
@RequireRole('customer')
export class CustomerController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
    private readonly scanService: ScanService,
    private readonly orders: OrdersService,
    private readonly coupons: CouponsService,
  ) {}

  /** 统一扫码入口：商品码、导购码、导购卡、订单码。 */
  @Post('scan')
  @HttpCode(200)
  scan(@ActorId() customerId: string, @Body(new ZodPipe(ScanBody)) body: z.infer<typeof ScanBody>) {
    return this.scanService.scan(customerId, body);
  }

  /** 我的导购：各商家当前有效的绑定。 */
  @Get('me/bindings')
  async myBindings(@ActorId() customerId: string) {
    const rows = await this.db
      .select({
        merchantId: merchants.id,
        merchantName: merchants.name,
        guideId: guides.id,
        guideName: guides.name,
        storeId: bindings.storeId,
        strength: bindings.strength,
        expiresAt: bindings.expiresAt,
      })
      .from(bindings)
      .innerJoin(merchants, eq(merchants.id, bindings.merchantId))
      .innerJoin(guides, eq(guides.id, bindings.guideId))
      .where(and(eq(bindings.customerId, customerId), gt(bindings.expiresAt, this.clock.now())));
    return { items: rows };
  }

  @Get('me/coupons')
  async myCoupons(@ActorId() customerId: string, @Query('merchantId') merchantId?: string) {
    const rows = await this.coupons.listUsable(customerId, merchantId ?? null, this.clock.now());
    return { items: rows.map(couponView) };
  }

  @Get('me/orders')
  async myOrders(@ActorId() customerId: string) {
    return { items: await this.orders.listForCustomer(customerId) };
  }

  /** 下单前试算：价格、优惠和归属预览。 */
  @Post('orders/quote')
  @HttpCode(200)
  quote(@ActorId() customerId: string, @Body(new ZodPipe(OrderBody)) body: z.infer<typeof OrderBody>) {
    return this.orders.quote(customerId, body);
  }

  @Post('orders')
  create(@ActorId() customerId: string, @Body(new ZodPipe(OrderBody)) body: z.infer<typeof OrderBody>) {
    return this.orders.create(customerId, body);
  }
}
