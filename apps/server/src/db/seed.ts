import { DEFAULT_ATTRIBUTION_RULES, DEFAULT_GUIDE_COUPON_RULES, formatStaticToken } from '@codeshop/domain';
import { eq } from 'drizzle-orm';
import type { Db } from './database';
import {
  codes,
  customers,
  guides,
  merchants,
  merchantSettings,
  skus,
  spus,
  stores,
  storeSamples,
} from './schema';

/**
 * 演示数据：两个商家（服饰、家居）、三家门店、四位导购、三位顾客。
 * ID 固定，方便本地联调和端到端测试引用。重复执行不会重复插入。
 */
export const DEMO = {
  merchants: { urban: 'm_urban', home: 'm_home' },
  stores: { jingan: 'st_urban_jingan', xujiahui: 'st_urban_xujiahui', pudong: 'st_home_pudong' },
  guides: { lin: 'gd_lin', zhou: 'gd_zhou', wang: 'gd_wang', chen: 'gd_chen' },
  customers: { alice: 'cu_alice', bob: 'cu_bob', linPersonal: 'cu_lin_personal' },
  spus: { trench: 'sp_trench', tee: 'sp_tee', sofa: 'sp_sofa' },
  skus: {
    trenchKhakiM: 'sk_trench_khaki_m',
    trenchBlackL: 'sk_trench_black_l',
    teeWhiteL: 'sk_tee_white_l',
    sofaCream: 'sk_sofa_cream',
  },
  codes: {
    jinganTrench: 'TrenchJingan',
    jinganTee: 'TeeJingan234',
    xujiahuiTrench: 'TrenchXjh234',
    pudongSofa: 'ShafaPudng23',
    linCard: 'GuideCardJA2',
  },
  /** 静安店坐标（GCJ-02） */
  jinganLocation: { lat: 31.2235, lng: 121.4453 },
} as const;

export async function seedDemo(db: Db): Promise<boolean> {
  // 固定的码 ID 也必须符合码格式，否则扫码时解析不出来
  for (const codeId of Object.values(DEMO.codes)) formatStaticToken('product', codeId);

  const [exists] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, DEMO.merchants.urban));
  if (exists) return false;

  await db.transaction(async (tx) => {
    await tx.insert(merchants).values([
      { id: DEMO.merchants.urban, name: '都市衣橱' },
      { id: DEMO.merchants.home, name: '木居家' },
    ]);

    // 家居商家用满减券，服饰商家用默认的 9 折
    await tx.insert(merchantSettings).values({
      merchantId: DEMO.merchants.home,
      attributionRules: { ...DEFAULT_ATTRIBUTION_RULES },
      guideCouponRules: {
        ...structuredClone(DEFAULT_GUIDE_COUPON_RULES),
        discount: { kind: 'threshold', thresholdCents: 500_000, offCents: 30_000 },
      },
    });

    await tx.insert(stores).values([
      { id: DEMO.stores.jingan, merchantId: DEMO.merchants.urban, name: '静安店', ...DEMO.jinganLocation },
      { id: DEMO.stores.xujiahui, merchantId: DEMO.merchants.urban, name: '徐家汇店', lat: 31.1955, lng: 121.4365 },
      { id: DEMO.stores.pudong, merchantId: DEMO.merchants.home, name: '浦东店', lat: 31.2304, lng: 121.53 },
    ]);

    await tx.insert(customers).values([
      { id: DEMO.customers.alice, phone: '13900000001' },
      { id: DEMO.customers.bob, phone: '13900000002' },
      { id: DEMO.customers.linPersonal, phone: '13800000001' },
    ]);

    await tx.insert(guides).values([
      {
        id: DEMO.guides.lin,
        merchantId: DEMO.merchants.urban,
        storeId: DEMO.stores.jingan,
        name: '林晓',
        phone: '13800000001',
        customerId: DEMO.customers.linPersonal,
        onDuty: true,
        zones: ['women'],
      },
      {
        id: DEMO.guides.zhou,
        merchantId: DEMO.merchants.urban,
        storeId: DEMO.stores.jingan,
        name: '周洋',
        phone: '13800000002',
        onDuty: true,
        zones: ['men'],
      },
      {
        id: DEMO.guides.wang,
        merchantId: DEMO.merchants.urban,
        storeId: DEMO.stores.xujiahui,
        name: '王珊',
        phone: '13800000003',
        onDuty: true,
        zones: ['women'],
      },
      {
        id: DEMO.guides.chen,
        merchantId: DEMO.merchants.home,
        storeId: DEMO.stores.pudong,
        name: '陈木',
        phone: '13800000004',
        onDuty: true,
        zones: ['living'],
      },
    ]);

    await tx.insert(spus).values([
      { id: DEMO.spus.trench, merchantId: DEMO.merchants.urban, name: '双排扣风衣' },
      { id: DEMO.spus.tee, merchantId: DEMO.merchants.urban, name: '纯棉圆领 T 恤' },
      { id: DEMO.spus.sofa, merchantId: DEMO.merchants.home, name: '三人位布艺沙发' },
    ]);

    const trench = (color: string, colorKey: string, size: string) => ({
      id: `sk_trench_${colorKey}_${size.toLowerCase()}`,
      merchantId: DEMO.merchants.urban,
      spuId: DEMO.spus.trench,
      color,
      size,
      priceCents: 59_900,
    });
    const tee = (color: string, colorKey: string, size: string) => ({
      id: `sk_tee_${colorKey}_${size.toLowerCase()}`,
      merchantId: DEMO.merchants.urban,
      spuId: DEMO.spus.tee,
      color,
      size,
      priceCents: 9_900,
    });
    await tx.insert(skus).values([
      ...['S', 'M', 'L'].flatMap((size) => [trench('卡其', 'khaki', size), trench('黑色', 'black', size)]),
      ...['M', 'L'].flatMap((size) => [tee('白色', 'white', size), tee('黑色', 'black', size)]),
      {
        id: DEMO.skus.sofaCream,
        merchantId: DEMO.merchants.home,
        spuId: DEMO.spus.sofa,
        color: '米白',
        size: '2.4 米',
        priceCents: 499_900,
      },
    ]);

    await tx.insert(storeSamples).values([
      { merchantId: DEMO.merchants.urban, storeId: DEMO.stores.jingan, skuId: 'sk_trench_khaki_m' },
      { merchantId: DEMO.merchants.urban, storeId: DEMO.stores.jingan, skuId: 'sk_trench_black_m' },
      { merchantId: DEMO.merchants.urban, storeId: DEMO.stores.jingan, skuId: 'sk_tee_white_l' },
      { merchantId: DEMO.merchants.urban, storeId: DEMO.stores.xujiahui, skuId: 'sk_trench_khaki_s' },
      { merchantId: DEMO.merchants.home, storeId: DEMO.stores.pudong, skuId: DEMO.skus.sofaCream },
    ]);

    await tx.insert(codes).values([
      {
        id: DEMO.codes.jinganTrench,
        kind: 'product',
        merchantId: DEMO.merchants.urban,
        storeId: DEMO.stores.jingan,
        spuId: DEMO.spus.trench,
        zone: 'women',
      },
      {
        id: DEMO.codes.jinganTee,
        kind: 'product',
        merchantId: DEMO.merchants.urban,
        storeId: DEMO.stores.jingan,
        spuId: DEMO.spus.tee,
        zone: 'men',
      },
      {
        id: DEMO.codes.xujiahuiTrench,
        kind: 'product',
        merchantId: DEMO.merchants.urban,
        storeId: DEMO.stores.xujiahui,
        spuId: DEMO.spus.trench,
        zone: 'women',
      },
      {
        id: DEMO.codes.pudongSofa,
        kind: 'product',
        merchantId: DEMO.merchants.home,
        storeId: DEMO.stores.pudong,
        spuId: DEMO.spus.sofa,
        zone: 'living',
      },
      {
        id: DEMO.codes.linCard,
        kind: 'card',
        merchantId: DEMO.merchants.urban,
        storeId: DEMO.stores.jingan,
        guideId: DEMO.guides.lin,
      },
    ]);
  });
  return true;
}
