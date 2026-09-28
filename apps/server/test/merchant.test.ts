import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO } from '../src/db/seed';
import { createTestApp, type TestApp } from './support/test-app';

/** 商家端：生码与规则配置（PRD 7）。 */
describe('商家端', () => {
  let t: TestApp;
  const urban = () => t.merchant(DEMO.merchants.urban);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('门店和商品列表只包含本商家的数据', async () => {
    const storesRes = await urban().get('/api/merchant/stores');
    expect(storesRes.body.items.map((s: { id: string }) => s.id).sort()).toEqual([
      DEMO.stores.jingan,
      DEMO.stores.xujiahui,
    ]);
    const spusRes = await urban().get('/api/merchant/spus');
    expect(spusRes.body.items.map((s: { id: string }) => s.id).sort()).toEqual([DEMO.spus.tee, DEMO.spus.trench]);
  });

  it('批量生码：新款生成新码，已有码的款返回原码，重复调用结果不变', async () => {
    const first = await urban().post(`/api/merchant/stores/${DEMO.stores.xujiahui}/product-codes`, {
      spuIds: [DEMO.spus.tee, DEMO.spus.trench],
      zone: 'men',
    });
    expect(first.status).toBe(201);
    const bySpu = Object.fromEntries(first.body.items.map((c: { spuId: string; codeId: string }) => [c.spuId, c]));
    expect(bySpu[DEMO.spus.trench].codeId).toBe(DEMO.codes.xujiahuiTrench);
    expect(bySpu[DEMO.spus.tee].token).toBe(`P${bySpu[DEMO.spus.tee].codeId}`);

    const second = await urban().post(`/api/merchant/stores/${DEMO.stores.xujiahui}/product-codes`, {
      spuIds: [DEMO.spus.tee],
    });
    expect(second.body.items[0].codeId).toBe(bySpu[DEMO.spus.tee].codeId);

    const scan = await t.customer('cu_dave').post('/api/scan', { token: bySpu[DEMO.spus.tee].qrUrl });
    expect(scan.body).toMatchObject({ kind: 'product', store: { id: DEMO.stores.xujiahui } });
  });

  it('不能给别家门店或别家商品生码', async () => {
    const otherStore = await urban().post(`/api/merchant/stores/${DEMO.stores.pudong}/product-codes`, {
      spuIds: [DEMO.spus.tee],
    });
    expect(otherStore.status).toBe(404);

    const otherSpu = await urban().post(`/api/merchant/stores/${DEMO.stores.jingan}/product-codes`, {
      spuIds: [DEMO.spus.sofa],
    });
    expect(otherSpu.status).toBe(422);
    expect(otherSpu.body.error).toMatchObject({ code: 'spu_not_found', details: [DEMO.spus.sofa] });
  });

  it('读取规则：未配置时为 PRD 默认值', async () => {
    const res = await urban().get('/api/merchant/settings');
    expect(res.body.attribution).toEqual({
      strongBindingDays: 30,
      weakBindingDays: 15,
      storeWindowDays: 15,
      lockStrongBinding: false,
    });
    expect(res.body.guideCoupon).toMatchObject({ validDays: 7, cooldownDays: 7, cardGeofenceMeters: 200 });
  });

  it('不合理的规则被拒绝', async () => {
    const res = await urban().put('/api/merchant/settings', {
      guideCoupon: { discount: { kind: 'percent', percentOff: 120 }, cardGeofenceMeters: 1 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid_rules');
    expect(res.body.error.details).toHaveLength(2);
  });

  it('开启强绑定锁定后，其他导购扫码不改变绑定，也不发券', async () => {
    const updated = await urban().put('/api/merchant/settings', { attribution: { lockStrongBinding: true } });
    expect(updated.status).toBe(200);
    expect(updated.body.attribution.lockStrongBinding).toBe(true);
    expect(updated.body.attribution.strongBindingDays).toBe(30);

    const erin = t.customer('cu_erin');
    const zhou = await t.guide(DEMO.guides.zhou).get('/api/guide/me/code');
    expect((await erin.post('/api/scan', { token: zhou.body.token })).body.bindingChange).toBe('created');

    const lin = await t.guide(DEMO.guides.lin).get('/api/guide/me/code');
    const res = await erin.post('/api/scan', { token: lin.body.token });
    expect(res.body).toMatchObject({
      bindingChange: 'rejected',
      bindingRejectedReason: 'strong_binding_locked',
      binding: { guide: { id: DEMO.guides.zhou } },
      coupon: null,
      couponBlocked: { reason: 'binding_not_changed' },
    });
  });

  it('商家只能操作自己的数据：别家商家读不到本商家配置', async () => {
    const home = await t.merchant(DEMO.merchants.home).get('/api/merchant/settings');
    expect(home.body.guideCoupon.discount).toEqual({ kind: 'threshold', thresholdCents: 500_000, offCents: 30_000 });
    expect(home.body.attribution.lockStrongBinding).toBe(false);
  });
});
