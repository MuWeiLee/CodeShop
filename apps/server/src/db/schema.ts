import type {
  AttributionRules,
  BindingStrength,
  CouponScope,
  CouponStatus,
  DiscountRule,
  GuideCouponRules,
  ServiceRecordType,
} from '@codeshop/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * 数据库表结构。
 *
 * 多商家隔离：除顾客账号外，每张业务表都带 merchant_id，服务层所有查询都按商家过滤。
 * 顾客账号在平台层（customers），与商家的关系（绑定、服务记录、券）都按「顾客 × 商家」存储。
 * 金额一律用整数「分」。时间一律带时区。
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

// ——— 平台与组织 ———

export const merchants = pgTable('merchants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'frozen'] }).notNull().default('active'),
  createdAt: createdAt(),
});

/** 商家规则配置（PRD 4.1、4.2）。没有记录时使用默认规则。 */
export const merchantSettings = pgTable('merchant_settings', {
  merchantId: text('merchant_id')
    .primaryKey()
    .references(() => merchants.id),
  attributionRules: jsonb('attribution_rules').$type<AttributionRules>().notNull(),
  guideCouponRules: jsonb('guide_coupon_rules').$type<GuideCouponRules>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const stores = pgTable(
  'stores',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    name: text('name').notNull(),
    /** 门店坐标，GCJ-02 */
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
    createdAt: createdAt(),
  },
  (t) => [index('stores_merchant_idx').on(t.merchantId)],
);

/** 顾客账号，平台层，一人一个。 */
export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  phone: text('phone'),
  createdAt: createdAt(),
});

export const guides = pgTable(
  'guides',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    phone: text('phone'),
    /** 导购本人的顾客账号（如有），用于防止自扫自买 */
    customerId: text('customer_id').references(() => customers.id),
    status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
    /** 是否当班（签到后为 true），只有当班导购参与自动分配 */
    onDuty: boolean('on_duty').notNull().default(false),
    /** 负责的陈列区 */
    zones: text('zones').array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    index('guides_merchant_idx').on(t.merchantId),
    index('guides_store_idx').on(t.storeId),
    index('guides_customer_idx').on(t.customerId),
  ],
);

// ——— 商品 ———

export const spus = pgTable(
  'spus',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    name: text('name').notNull(),
    status: text('status', { enum: ['on_sale', 'off_sale'] }).notNull().default('on_sale'),
    createdAt: createdAt(),
  },
  (t) => [index('spus_merchant_idx').on(t.merchantId)],
);

export const skus = pgTable(
  'skus',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    spuId: text('spu_id')
      .notNull()
      .references(() => spus.id),
    color: text('color').notNull(),
    size: text('size').notNull(),
    priceCents: integer('price_cents').notNull(),
    status: text('status', { enum: ['on_sale', 'off_sale'] }).notNull().default('on_sale'),
  },
  (t) => [index('skus_spu_idx').on(t.spuId)],
);

/** 门店有哪些规格的样品，决定商品页上「店内可试」的标注。 */
export const storeSamples = pgTable(
  'store_samples',
  {
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id),
    skuId: text('sku_id')
      .notNull()
      .references(() => skus.id),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.skuId] })],
);

// ——— 码 ———

/** 静态码：商品码、实体导购卡、订单码。导购动态码不入库。 */
export const codes = pgTable(
  'codes',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['product', 'card', 'order'] }).notNull(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id),
    spuId: text('spu_id').references(() => spus.id),
    guideId: text('guide_id').references(() => guides.id),
    orderDraftId: text('order_draft_id'),
    /** 商品所在陈列区，用于自动分配责任导购 */
    zone: text('zone'),
    status: text('status', { enum: ['active', 'void'] }).notNull().default('active'),
    expiresAt: ts('expires_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('codes_merchant_idx').on(t.merchantId),
    // 同一家店同一款只有一个有效商品码
    uniqueIndex('codes_active_product_uq')
      .on(t.storeId, t.spuId)
      .where(sql`kind = 'product' and status = 'active'`),
  ],
);

// ——— 服务记录与绑定 ———

export const serviceRecords = pgTable(
  'service_records',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    storeId: text('store_id').references(() => stores.id),
    guideId: text('guide_id').references(() => guides.id),
    type: text('type').$type<ServiceRecordType>().notNull(),
    spuId: text('spu_id').references(() => spus.id),
    /** 附加信息，例如订单码对应的开单草稿、绑定变化结果 */
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    at: ts('at').notNull(),
  },
  (t) => [
    index('service_records_customer_merchant_at_idx').on(t.customerId, t.merchantId, t.at),
    index('service_records_guide_idx').on(t.guideId),
  ],
);

/** 顾客在每个商家内最多一个绑定：主键「顾客 × 商家」。 */
export const bindings = pgTable(
  'bindings',
  {
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    guideId: text('guide_id')
      .notNull()
      .references(() => guides.id),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id),
    strength: text('strength').$type<BindingStrength>().notNull(),
    since: ts('since').notNull(),
    expiresAt: ts('expires_at').notNull(),
    sourceRecordId: text('source_record_id').notNull(),
    lastRecordId: text('last_record_id').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.customerId, t.merchantId] }),
    index('bindings_guide_expires_idx').on(t.guideId, t.expiresAt),
  ],
);

// ——— 券 ———

export const coupons = pgTable(
  'coupons',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    guideId: text('guide_id')
      .notNull()
      .references(() => guides.id),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id),
    discount: jsonb('discount').$type<DiscountRule>().notNull(),
    scope: jsonb('scope').$type<CouponScope>().notNull(),
    stackWithPlatform: boolean('stack_with_platform').notNull(),
    status: text('status').$type<CouponStatus>().notNull().default('unused'),
    issuedAt: ts('issued_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
    /** 发券时对应的扫码服务记录 */
    issuedRecordId: text('issued_record_id').notNull(),
    usedOrderId: text('used_order_id'),
  },
  (t) => [index('coupons_customer_merchant_issued_idx').on(t.customerId, t.merchantId, t.issuedAt)],
);

// ——— 订单 ———

export interface DraftLine {
  skuId: string;
  quantity: number;
}

/** 导购开单草稿，顾客扫订单码后据此下单。 */
export const orderDrafts = pgTable(
  'order_drafts',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id),
    guideId: text('guide_id')
      .notNull()
      .references(() => guides.id),
    lines: jsonb('lines').$type<DraftLine[]>().notNull(),
    status: text('status', { enum: ['open', 'consumed'] }).notNull().default('open'),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [index('order_drafts_guide_idx').on(t.guideId)],
);

export interface OrderLineSnapshot {
  skuId: string;
  spuId: string;
  name: string;
  color: string;
  size: string;
  unitPriceCents: number;
  quantity: number;
  /** 分摊到本行的优惠 */
  discountCents: number;
}

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    source: text('source', { enum: ['self', 'staff_draft'] }).notNull(),
    draftId: text('draft_id'),
    lines: jsonb('lines').$type<OrderLineSnapshot[]>().notNull(),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    couponId: text('coupon_id'),
    status: text('status', { enum: ['pending_payment', 'paid', 'cancelled'] })
      .notNull()
      .default('pending_payment'),
    /** 归属结果：guide / store_pool / organic */
    attrKind: text('attr_kind', { enum: ['guide', 'store_pool', 'organic'] }).notNull(),
    attrStoreId: text('attr_store_id'),
    attrGuideId: text('attr_guide_id'),
    /** 归属依据的服务记录，争议时据此追溯 */
    attrBasisRecordId: text('attr_basis_record_id'),
    commissionEligible: boolean('commission_eligible').notNull(),
    commissionIneligibleReason: text('commission_ineligible_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('orders_merchant_idx').on(t.merchantId, t.createdAt),
    index('orders_customer_idx').on(t.customerId),
    index('orders_attr_guide_idx').on(t.attrGuideId),
  ],
);
