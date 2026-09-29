// 与服务端 /api/scan 等接口的返回结构对应（apps/server/src/modules/scan/scan.service.ts）。

export interface Named {
  id: string;
  name: string;
}

export interface BindingView {
  guide: Named;
  storeId: string;
  strength: 'strong' | 'weak';
  expiresAt: string;
}

export interface CouponView {
  id: string;
  merchantId: string;
  guideId: string;
  description: string;
  expiresAt: string;
}

export interface SkuView {
  skuId: string;
  color: string;
  size: string;
  priceCents: number;
  tryInStore: boolean;
}

export type ScanResult =
  | {
      kind: 'product';
      merchant: Named;
      store: Named;
      product: { spuId: string; name: string; skus: SkuView[] };
      binding: BindingView | null;
      autoAssign: string;
      couponHint: string | null;
    }
  | {
      kind: 'guide';
      merchant: Named;
      store: Named;
      guide: Named;
      binding: BindingView | null;
      bindingChange: string;
      bindingRejectedReason: string | null;
      coupon: CouponView | null;
      couponBlocked: { reason: string; retryAt?: string } | null;
    }
  | {
      kind: 'order';
      merchant: Named;
      store: Named;
      guide: Named;
      draft: {
        id: string;
        expiresAt: string;
        lines: Array<{ skuId: string; name: string; color: string; size: string; unitPriceCents: number; quantity: number }>;
        subtotalCents: number;
      };
      binding: BindingView | null;
      usableCoupons: CouponView[];
    };

export interface Quote {
  lines: Array<{ skuId: string; name: string; color: string; size: string; unitPriceCents: number; quantity: number }>;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  attribution: { kind: 'guide' | 'store_pool' | 'organic'; guideId: string | null; storeId: string | null };
}
