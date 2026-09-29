import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO } from '../src/db/seed';
import { createTestApp, type TestApp } from './support/test-app';

/** 防作弊、多商家隔离、登录与并发（PRD 2.2、4.4、10.2）。 */
describe('安全与隔离', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('未登录访问需要登录的接口返回 401', async () => {
    const res = await t.anonymous().post('/api/scan').send({ token: `P${DEMO.codes.jinganTrench}` });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthenticated');
    expect((await t.anonymous().get('/api/health')).body).toEqual({ ok: true });
  });

  it('不认识的二维码与参数错误', async () => {
    const alice = t.customer(DEMO.customers.alice);
    const bad = await alice.post('/api/scan', { token: 'https://evil.example.com/other' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('invalid_code');

    const forged = await alice.post('/api/scan', { token: 'G.gd_lin.abc.AAAAAAAAAAAAAAAAAAAAAA' });
    expect(forged.status).toBe(422);
    expect(forged.body.error.code).toBe('invalid_code');

    const invalid = await alice.post('/api/scan', { token: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('invalid_request');
  });

  it('导购用自己的顾客账号扫自己的码：不绑定、不发券', async () => {
    const code = await t.guide(DEMO.guides.lin).get('/api/guide/me/code');
    const res = await t.customer(DEMO.customers.linPersonal).post('/api/scan', { token: code.body.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      bindingChange: 'rejected',
      bindingRejectedReason: 'self_binding',
      binding: null,
      coupon: null,
      couponBlocked: { reason: 'self_scan' },
    });
  });

  it('导购自扫商品码不会被分配给自己；员工本人下单不计佣金', async () => {
    const lin = t.customer(DEMO.customers.linPersonal);
    const scan = await lin.post('/api/scan', { token: `P${DEMO.codes.jinganTrench}` });
    // 女装区只有林晓当班，排除本人后进入线索池
    expect(scan.body).toMatchObject({ autoAssign: 'lead_pool', binding: null });

    const quote = await lin.post('/api/orders/quote', {
      merchantId: DEMO.merchants.urban,
      lines: [{ skuId: 'sk_trench_khaki_m', quantity: 1 }],
    });
    expect(quote.body.attribution).toMatchObject({
      kind: 'store_pool',
      storeId: DEMO.stores.jingan,
      commissionEligible: false,
      ineligibleReason: 'staff_purchase',
    });
  });

  it('多商家隔离：顾客在两个商家各有一条绑定，互不影响；券不能跨商家用', async () => {
    const alice = t.customer(DEMO.customers.alice);
    const zhouCode = await t.guide(DEMO.guides.zhou).get('/api/guide/me/code');
    const urban = await alice.post('/api/scan', { token: zhouCode.body.token });
    expect(urban.body.coupon).toBeTruthy();

    const home = await alice.post('/api/scan', { token: `P${DEMO.codes.pudongSofa}` });
    expect(home.body).toMatchObject({
      merchant: { id: DEMO.merchants.home },
      binding: { guide: { id: DEMO.guides.chen }, strength: 'weak' },
      couponHint: '找导购扫码可享 满 5000 元减 300 元',
    });

    const bindings = await alice.get('/api/me/bindings');
    const byMerchant = Object.fromEntries(
      bindings.body.items.map((b: { merchantId: string; guideId: string }) => [b.merchantId, b.guideId]),
    );
    expect(byMerchant).toEqual({ [DEMO.merchants.urban]: DEMO.guides.zhou, [DEMO.merchants.home]: DEMO.guides.chen });

    const cross = await alice.post('/api/orders/quote', {
      merchantId: DEMO.merchants.home,
      lines: [{ skuId: DEMO.skus.sofaCream, quantity: 1 }],
      couponId: urban.body.coupon.id,
    });
    expect(cross.status).toBe(422);
    expect(cross.body.error.code).toBe('coupon_wrong_merchant');

    const foreignSku = await alice.post('/api/orders/quote', {
      merchantId: DEMO.merchants.urban,
      lines: [{ skuId: DEMO.skus.sofaCream, quantity: 1 }],
    });
    expect(foreignSku.status).toBe(422);
    expect(foreignSku.body.error.code).toBe('sku_unavailable');
  });

  it('别人的券查不到', async () => {
    const alice = t.customer(DEMO.customers.alice);
    const [coupon] = (await alice.get('/api/me/coupons')).body.items;
    const res = await t.customer(DEMO.customers.bob).post('/api/orders/quote', {
      merchantId: DEMO.merchants.urban,
      lines: [{ skuId: 'sk_tee_white_m', quantity: 1 }],
      couponId: coupon.id,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('coupon_not_found');
  });

  it('并发扫同一个导购码：只发一张券', async () => {
    const code = await t.guide(DEMO.guides.wang).get('/api/guide/me/code');
    const carol = t.customer('cu_carol');
    const results = await Promise.all(Array.from({ length: 5 }, () => carol.post('/api/scan', { token: code.body.token })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.coupon).length).toBe(1);
    expect((await carol.get('/api/me/coupons')).body.items).toHaveLength(1);
  });
});

describe('未接入正式登录时', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ authMode: 'none' });
  });
  afterAll(async () => {
    await t.close();
  });

  it('即使带了开发用请求头也一律 401', async () => {
    const res = await t.customer(DEMO.customers.alice).post('/api/scan', { token: `P${DEMO.codes.jinganTrench}` });
    expect(res.status).toBe(401);
  });
});
