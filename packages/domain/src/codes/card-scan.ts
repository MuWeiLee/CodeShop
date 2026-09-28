import { distanceMeters, isValidLatLng, type LatLng } from '../geo.js';

export interface CardScanInput {
  /** 顾客扫码时上报的位置（GCJ-02）。 */
  customerLocation: LatLng | null | undefined;
  /** 定位精度（米），来自 wx.getLocation 的 accuracy。 */
  accuracyMeters?: number | null;
  /** 门店坐标（GCJ-02）。 */
  storeLocation: LatLng | null | undefined;
  /** 商家设置的校验半径（米）。 */
  radiusMeters: number;
}

export type CardScanCheck =
  | { ok: true; distanceMeters: number }
  | {
      ok: false;
      reason: 'location_required' | 'location_inaccurate' | 'out_of_range' | 'store_location_missing';
      distanceMeters?: number;
    };

/**
 * 实体导购卡的定位校验：只在扫卡这一刻校验一次，不追踪顾客之后的位置。
 * 校验失败时不绑定、不发券（PRD 4.2）。所有异常情况都按失败处理。
 */
export function verifyCardScan(input: CardScanInput): CardScanCheck {
  if (!isValidLatLng(input.storeLocation)) return { ok: false, reason: 'store_location_missing' };
  if (!isValidLatLng(input.customerLocation)) return { ok: false, reason: 'location_required' };

  // 精度比校验半径还差时无法判断，按失败处理，避免用粗糙定位绕过校验
  const accuracy = input.accuracyMeters;
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy > input.radiusMeters)) {
    return { ok: false, reason: 'location_inaccurate' };
  }

  const distance = distanceMeters(input.customerLocation, input.storeLocation);
  if (distance > input.radiusMeters) {
    return { ok: false, reason: 'out_of_range', distanceMeters: Math.round(distance) };
  }
  return { ok: true, distanceMeters: Math.round(distance) };
}
