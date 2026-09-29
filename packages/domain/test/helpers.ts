import type { Binding, ServiceRecord, ServiceRecordType } from '../src/index.js';

export const T0 = new Date('2026-10-01T02:00:00.000Z'); // 北京时间 10:00

export function at(days: number, hours = 0): Date {
  return new Date(T0.getTime() + days * 86_400_000 + hours * 3_600_000);
}

let seq = 0;

export function record(
  type: ServiceRecordType,
  opts: { guideId?: string | null; storeId?: string | null; at?: Date; customerId?: string; merchantId?: string } = {},
): ServiceRecord {
  seq += 1;
  return {
    id: `r${seq}`,
    customerId: opts.customerId ?? 'cust-1',
    merchantId: opts.merchantId ?? 'm-A',
    storeId: opts.storeId === undefined ? 'store-A1' : opts.storeId,
    guideId: opts.guideId === undefined ? null : opts.guideId,
    type,
    at: opts.at ?? T0,
  };
}

export function binding(overrides: Partial<Binding> = {}): Binding {
  return {
    customerId: 'cust-1',
    merchantId: 'm-A',
    guideId: 'g-1',
    storeId: 'store-A1',
    strength: 'strong',
    since: T0,
    expiresAt: at(30),
    sourceRecordId: 'r-src',
    lastRecordId: 'r-src',
    ...overrides,
  };
}
