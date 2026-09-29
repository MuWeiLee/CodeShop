import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO } from '../src/db/seed';
import { createTestApp, type TestApp } from './support/test-app';

/** 导购开单（PRD 3.2）：导购扫码开单 → 顾客扫订单码 → 顾客自己付款，订单直接归开单导购。 */
describe('导购开单', () => {
  let t: TestApp;
  const bob = () => t.customer(DEMO.customers.bob);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  let draft: { draftId: string; token: string; qrUrl: string; subtotalCents: number };

  it('导购开单，返回 30 分钟有效的订单码', async () => {
    const res = await t.guide(DEMO.guides.zhou).post('/api/guide/order-drafts', {
      lines: [
        { skuId: 'sk_trench_black_l', quantity: 1 },
        { skuId: 'sk_tee_black_l', quantity: 2 },
      ],
    });
    expect(res.status).toBe(201);
    draft = res.body;
    expect(draft.token).toMatch(/^O/);
    expect(draft.subtotalCents).toBe(59_900 + 2 * 9_900);
  });

  it('开单里有别家商家的商品时拒绝', async () => {
    const res = await t
      .guide(DEMO.guides.zhou)
      .post('/api/guide/order-drafts', { lines: [{ skuId: DEMO.skus.sofaCream, quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('sku_unavailable');
  });

  it('没扫过订单码的顾客不能用这张开单下单', async () => {
    const res = await t.customer('cu_carol').post('/api/orders', { merchantId: DEMO.merchants.urban, draftId: draft.draftId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('draft_not_scanned');
  });

  it('顾客扫订单码：看到开单内容，并与开单导购强绑定', async () => {
    const res = await bob().post('/api/scan', { token: draft.qrUrl });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      kind: 'order',
      guide: { id: DEMO.guides.zhou },
      draft: { id: draft.draftId, subtotalCents: 79_700 },
      binding: { guide: { id: DEMO.guides.zhou }, strength: 'strong' },
      usableCoupons: [],
    });
    expect(res.body.draft.lines).toHaveLength(2);
  });

  it('顾客按开单下单：订单归开单导购，开单随即失效', async () => {
    const res = await bob().post('/api/orders', { merchantId: DEMO.merchants.urban, draftId: draft.draftId, lines: [] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source: 'staff_draft',
      draftId: draft.draftId,
      subtotalCents: 79_700,
      attrKind: 'guide',
      attrGuideId: DEMO.guides.zhou,
      attrStoreId: DEMO.stores.jingan,
      commissionEligible: true,
    });

    const again = await bob().post('/api/orders', { merchantId: DEMO.merchants.urban, draftId: draft.draftId });
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('draft_unavailable');

    const rescan = await bob().post('/api/scan', { token: draft.token });
    expect(rescan.status).toBe(404);
    expect(rescan.body.error.code).toBe('code_not_found');
  });

  it('订单码过期后不能再扫', async () => {
    const res = await t
      .guide(DEMO.guides.zhou)
      .post('/api/guide/order-drafts', { lines: [{ skuId: 'sk_tee_white_m', quantity: 1 }] });
    t.clock.advance(31 * 60 * 1000);
    const scan = await bob().post('/api/scan', { token: res.body.token });
    expect(scan.status).toBe(404);
    expect(scan.body.error.code).toBe('code_not_found');
  });
});
