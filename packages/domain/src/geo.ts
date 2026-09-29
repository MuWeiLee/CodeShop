/**
 * 经纬度坐标。
 *
 * 注意坐标系：国内地图和微信 `wx.getLocation({ type: 'gcj02' })` 使用 GCJ-02，
 * 与 GPS 原始的 WGS-84 相差可达数百米，远大于默认 200 米的校验半径。
 * 系统约定门店坐标和顾客上报坐标一律使用 GCJ-02，混用会导致校验误判。
 */
export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

export function isValidLatLng(point: unknown): point is LatLng {
  if (typeof point !== 'object' || point === null) return false;
  const { lat, lng } = point as Record<string, unknown>;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** 两点间的球面距离（米），半正矢公式。门店尺度下误差可忽略。 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
