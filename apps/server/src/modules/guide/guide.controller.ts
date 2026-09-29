import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ActorId, AuthGuard, RequireRole } from '../../common/auth';
import { ZodPipe } from '../../common/zod-pipe';
import { CodesService } from '../codes/codes.service';
import { OrdersService } from '../orders/orders.service';

const DraftBody = z.object({
  lines: z
    .array(z.object({ skuId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
});

/** 导购端接口。 */
@Controller('guide')
@UseGuards(AuthGuard)
@RequireRole('guide')
export class GuideController {
  constructor(
    private readonly codes: CodesService,
    private readonly orders: OrdersService,
  ) {}

  /** 我的码：动态导购码，前端在 refreshAt 时刷新。 */
  @Get('me/code')
  myCode(@ActorId() guideId: string) {
    return this.codes.guideDynamicCode(guideId);
  }

  /** 导购开单：返回订单码，顾客扫码后自己付款。 */
  @Post('order-drafts')
  createDraft(@ActorId() guideId: string, @Body(new ZodPipe(DraftBody)) body: z.infer<typeof DraftBody>) {
    return this.orders.createDraft(guideId, body.lines);
  }
}
