import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO } from '../src/db/seed';
import { createTestApp, START, type TestApp } from './support/test-app';

/**
 * 顾客主流程（PRD 3.1、3.3、3.4、4.1、4.2）：
 * 自扫商品码 → 自动分配弱绑定 → 扫导购码升级为强绑定并领券 → 离店后下单归属导购 → 过期后变为自然订单。
 */
describe('顾客主流程：扫码、绑定、领券、离店下单', () => {
  let t: TestApp;
  const alice = () => t.customer(DEMO.customers.alice);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('扫商品码：进入店内模式，按陈列区自动分配导购（弱绑定）', async () => {
    const res = await alice().post('/api/scan', { token: `https://m.codeshop.test/q/P${DEMO.codes.jinganTrench}` });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kind: 'product',
      merchant: { id: DEMO.merchants.urban, name: '都市衣橱' },
      store: { id: DEMO.stores.jingan, name: '静安店' },
      autoAssign: 'zone',
      binding: { guide: { id: DEMO.guides.lin, name: '林晓' }, strength: 'weak' },
      couponHint: '找导购扫码可享 9 折',
    });
    const product = res.body.product;
    expect(product.skus).toHaveLength(6);
    const tryable = product.skus.filter((s: { tryInStore: boolean }) => s.tryInStore).map((s: { skuId: string }) => s.skuId);
    expect(tryable.sort()).toEqual(['sk_trench_black_m', 'sk_trench_khaki_m']);
  });

  it('扫另一位导购的动态码：强绑定覆盖弱绑定，并领到 7 天有效的导购券', async () => {
    const code = await t.guide(DEMO.guides.zhou).get('/api/guide/me/code');
    expect(code.status).toBe(200);
    expect(code.body.qrUrl).toBe(`https://m.codeshop.test/q/${code.body.token}`);

    const res = await alice().post('/api/scan', { token: code.body.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kind: 'guide',
      guide: { id: DEMO.guides.zhou, name: '周洋' },
      bindingChange: 'replaced',
      binding: { guide: { id: DEMO.guides.zhou }, strength: 'strong' },
      coupon: { description: '9 折', guideId: DEMO.guides.zhou },
      couponBlocked: null,
    });
    expect(new Date(res.body.coupon.expiresAt).getTime()).toBe(START.getTime() + 7 * 86_400_000);
  });

  it('同一位导购再扫一次：绑定续期，但 7 天内不重复发券', async () => {
    t.clock.advance(60 * 60 * 1000);
    const code = await t.guide(DEMO.guides.zhou).get('/api/guide/me/code');
    const res = await alice().post('/api/scan', { token: code.body.token });
    expect(res.body).toMatchObject({ bindingChange: 'renewed', coupon: null, couponBlocked: { reason: 'cooldown' } });
    expect(new Date(res.body.couponBlocked.retryAt).getTime()).toBe(START.getTime() + 7 * 86_400_000);
  });

  it('扫实体导购卡：必须在门店附近，校验失败不绑定也不发券', async () => {
    const token = `C${DEMO.codes.linCard}`;
    const far = await alice().post('/api/scan', { token, location: { lat: 31.2335, lng: 121.4453 } });
    expect(far.status).toBe(422);
    expect(far.body.error).toMatchObject({ code: 'card_out_of_range', details: { radiusMeters: 200 } });

    const noLocation = await alice().post('/api/scan', { token });
    expect(noLocation.status).toBe(422);
    expect(noLocation.body.error.code).toBe('card_location_required');

    const bindings = await alice().get('/api/me/bindings');
    expect(bindings.body.items).toEqual([
      expect.objectContaining({ merchantId: DEMO.merchants.urban, guideId: DEMO.guides.zhou, strength: 'strong' }),
    ]);
  });

  it('导购动态码过了容忍窗口就失效', async () => {
    const code = await t.guide(DEMO.guides.lin).get('/api/guide/me/code');
    t.clock.advance(3 * 60 * 1000);
    const res = await alice().post('/api/scan', { token: code.body.token });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('guide_code_expired');
  });

  it('离店三天后在家下单：用导购券，订单归属绑定导购', async () => {
    t.clock.advanceDays(3);
    const coupons = await alice().get(`/api/me/coupons?merchantId=${DEMO.merchants.urban}`);
    expect(coupons.body.items).toHaveLength(1);
    const couponId = coupons.body.items[0].id;

    const body = {
      merchantId: DEMO.merchants.urban,
      lines: [
        { skuId: 'sk_trench_khaki_l', quantity: 1 },
        { skuId: 'sk_tee_white_l', quantity: 1 },
      ],
      couponId,
    };
    const quote = await alice().post('/api/orders/quote', body);
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({
      subtotalCents: 69_800,
      discountCents: 6_980,
      totalCents: 62_820,
      attribution: {
        kind: 'guide',
        guideId: DEMO.guides.zhou,
        storeId: DEMO.stores.jingan,
        commissionEligible: true,
      },
    });
    expect(quote.body.lines.map((l: { discountCents: number }) => l.discountCents)).toEqual([5_990, 990]);

    const order = await alice().post('/api/orders', body);
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({
      source: 'self',
      status: 'pending_payment',
      totalCents: 62_820,
      attrKind: 'guide',
      attrGuideId: DEMO.guides.zhou,
      commissionEligible: true,
      couponId,
    });
    expect(order.body.attrBasisRecordId).toMatch(/^sr_/);

    const reuse = await alice().post('/api/orders', body);
    expect(reuse.status).toBe(422);
    expect(reuse.body.error.code).toBe('coupon_not_usable');
  });

  it('客户端传来的价格一律不采信', async () => {
    const res = await alice().post('/api/orders/quote', {
      merchantId: DEMO.merchants.urban,
      lines: [{ skuId: 'sk_tee_black_m', quantity: 2, unitPriceCents: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.subtotalCents).toBe(19_800);
  });

  it('绑定过期且超出门店归因窗口后，订单成为线上自然订单', async () => {
    t.clock.advanceDays(30);
    const res = await alice().post('/api/orders/quote', {
      merchantId: DEMO.merchants.urban,
      lines: [{ skuId: 'sk_tee_black_m', quantity: 1 }],
    });
    expect(res.body.attribution).toEqual({
      kind: 'organic',
      storeId: null,
      guideId: null,
      basisRecordId: null,
      commissionEligible: false,
      ineligibleReason: null,
    });
    const bindings = await alice().get('/api/me/bindings');
    expect(bindings.body.items).toEqual([]);
  });
});
